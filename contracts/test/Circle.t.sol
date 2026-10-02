// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console2} from "forge-std/Test.sol";
import {Circle, IAUSD} from "../src/Circle.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

interface IAUSDExtra {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function cancelAuthorization(address authorizer, bytes32 nonce, uint8 v, bytes32 r, bytes32 s) external;
}

/// Real AUSD on a Monad testnet fork (chain 10143). Run: script/test.sh
contract CircleTest is Test {
    address immutable AUSD = vm.envOr("AUSD", address(0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC));
    bytes32 constant RECEIVE_TYPEHASH = 0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8;
    bytes32 constant CANCEL_TYPEHASH = 0x158b0a9edf7a828aad02f63cd515c68ef2f50ba807396f6d12842833a1597429;
    uint256 constant C = 5e6;
    uint256 constant N = 5;
    uint256 constant PERIOD = 7 days;
    uint256 constant WALLET = 100e6;
    uint256 constant JOIN = type(uint256).max;

    IAUSD token = IAUSD(AUSD);
    CircleFactory factory;
    Circle circle;
    address relayer = makeAddr("relayer");
    address sink = makeAddr("sink");
    address inviteAddr;
    uint256 inviteKey;
    address org;
    uint256 orgKey;
    address[N] m;
    uint256[N] pk;

    function setUp() public {
        (inviteAddr, inviteKey) = makeAddrAndKey("invite");
        (org, orgKey) = makeAddrAndKey("organiser");
        _fund(org, WALLET);
        string[] memory labels = new string[](N);
        for (uint256 i; i < N; i++) {
            (m[i], pk[i]) = makeAddrAndKey(string.concat("member", vm.toString(i)));
            labels[i] = string.concat("Member ", vm.toString(i));
            _fund(m[i], WALLET);
        }
        factory = new CircleFactory(AUSD);
        vm.prank(relayer);
        circle = factory.create("Saturday Ajo", labels, C, PERIOD, org, inviteAddr);
    }

    // ---------- helpers ----------

    /// forge's deal() cannot write AUSD (balance packed << 8 in its account slot); write the recorded slot instead.
    function _fund(address who, uint256 amount) internal {
        vm.record();
        token.balanceOf(who);
        (bytes32[] memory reads,) = vm.accesses(AUSD);
        vm.store(AUSD, reads[reads.length - 1], bytes32(amount << 8));
        assertEq(token.balanceOf(who), amount, "funded");
    }

    function _sig(uint256 key, bytes32 digest) internal pure returns (Circle.Sig memory s) {
        (s.v, s.r, s.s) = vm.sign(key, digest);
    }

    function _authDigest(address from, uint256 value, uint256 validBefore, bytes32 nonce) internal view returns (bytes32) {
        bytes32 sh = keccak256(abi.encode(RECEIVE_TYPEHASH, from, address(circle), value, 0, validBefore, nonce));
        return keccak256(abi.encodePacked("\x19\x01", IAUSDExtra(AUSD).DOMAIN_SEPARATOR(), sh));
    }

    function _schedule(uint256 i) internal view returns (Circle.Sig[] memory rounds) {
        rounds = new Circle.Sig[](N - 1);
        for (uint256 r = 1; r < N; r++) {
            rounds[r - 1] = _sig(pk[i], _authDigest(m[i], C, type(uint256).max, circle.nonceFor(r, m[i])));
        }
    }

    function _join(uint256 i) internal {
        Circle.Sig memory invite = _sig(inviteKey, circle.inviteDigest(i, m[i]));
        Circle.Sig memory pay = _sig(pk[i], _authDigest(m[i], circle.joinAmount(), block.timestamp + 1 hours, circle.nonceFor(JOIN, m[i])));
        Circle.Sig[] memory rounds = _schedule(i);
        vm.prank(relayer);
        circle.join(i, m[i], invite, block.timestamp + 1 hours, pay, rounds);
    }

    function _joinAll() internal {
        for (uint256 i; i < N; i++) _join(i);
    }

    function _bond(uint256 amount) internal {
        Circle.Sig memory sig = _sig(orgKey, _authDigest(org, amount, block.timestamp + 1 hours, circle.bondNonce()));
        vm.prank(relayer);
        circle.addBond(amount, block.timestamp + 1 hours, sig);
    }

    function _drain(uint256 i) internal {
        uint256 b = token.balanceOf(m[i]);
        vm.prank(m[i]);
        token.transfer(sink, b);
    }

    /// Runs round `r`: warp to its opening, pull standing orders, and pay out (after the due date if anyone is unpaid).
    function _runRound(uint256 r) internal {
        vm.warp(circle.opensAt(r));
        vm.prank(relayer);
        circle.collect();
        if (circle.paidCount(r) < N) vm.warp(circle.dueAt(r) + 1);
        vm.prank(relayer);
        circle.payout();
    }

    function _finish() internal {
        for (uint256 i; i < N; i++) circle.returnSetAside(m[i]);
        circle.returnBond();
    }

    function _total() internal view returns (uint256 t) {
        for (uint256 i; i < N; i++) t += token.balanceOf(m[i]);
        t += token.balanceOf(sink) + token.balanceOf(address(circle)) + token.balanceOf(org);
    }

    // ---------- the claim ----------

    function test_fullCycle_gaslessForMembers_eachPaidOnce_allNetZero() public {
        uint256 before = _total();
        uint256 g = gasleft();
        _join(0);
        console2.log("gas join (5 members, 4 standing orders)", g - gasleft());
        for (uint256 i = 1; i < N; i++) _join(i);
        assertEq(circle.start(), block.timestamp, "starts when the last slot is claimed");
        assertEq(token.balanceOf(address(circle)), N * 2 * C, "round 0 plus a one-round set-aside from everyone");

        for (uint256 r; r < N; r++) {
            uint256 had = token.balanceOf(m[r]);
            vm.warp(circle.opensAt(r));
            if (r > 0) {
                g = gasleft();
                vm.prank(relayer);
                assertEq(circle.collect(), N, "every standing order pulls");
                console2.log("gas collect (5 pulls)", g - gasleft());
            }
            g = gasleft();
            vm.prank(relayer);
            circle.payout();
            if (r == 1) console2.log("gas payout", g - gasleft());
            assertEq(token.balanceOf(m[r]) + (r > 0 ? C : 0), had + N * C, "slot r collects the whole pot, once");
        }
        vm.expectRevert(bytes("Circle:not-active"));
        circle.payout();
        _finish();
        assertEq(token.balanceOf(address(circle)), 0, "nothing left behind");
        for (uint256 i; i < N; i++) assertEq(token.balanceOf(m[i]), WALLET, "every member nets zero");
        assertEq(_total(), before, "conserved");
    }

    function test_firstCollectorGetsCredit_notAPrepayment() public {
        _joinAll();
        vm.prank(relayer);
        circle.payout();
        // slot 0 has put in 2C and walks away with N*C: the early slot is a loan, as in every real circle
        assertEq(token.balanceOf(m[0]), WALLET - 2 * C + N * C);
    }

    // ---------- join negatives ----------

    function test_join_rejectsWrongInviteKey() public {
        (, uint256 otherKey) = makeAddrAndKey("not-the-invite");
        Circle.Sig memory invite = _sig(otherKey, circle.inviteDigest(0, m[0]));
        Circle.Sig memory pay = _sig(pk[0], _authDigest(m[0], 2 * C, block.timestamp + 1, circle.nonceFor(JOIN, m[0])));
        Circle.Sig[] memory rounds = _schedule(0);
        vm.expectRevert(bytes("Circle:invite"));
        circle.join(0, m[0], invite, block.timestamp + 1, pay, rounds);
    }

    function test_join_inviteBoundToMemberAndSlot() public {
        Circle.Sig memory inviteForM0 = _sig(inviteKey, circle.inviteDigest(0, m[0]));
        Circle.Sig memory pay = _sig(pk[1], _authDigest(m[1], 2 * C, block.timestamp + 1, circle.nonceFor(JOIN, m[1])));
        Circle.Sig[] memory rounds = _schedule(1);
        vm.expectRevert(bytes("Circle:invite"));
        circle.join(0, m[1], inviteForM0, block.timestamp + 1, pay, rounds);
        Circle.Sig memory inviteSlot0 = _sig(inviteKey, circle.inviteDigest(0, m[1]));
        vm.expectRevert(bytes("Circle:invite"));
        circle.join(1, m[1], inviteSlot0, block.timestamp + 1, pay, rounds);
    }

    function test_join_slotTakenAndDoubleJoinAndAfterStart() public {
        _join(0);
        Circle.Sig memory invite = _sig(inviteKey, circle.inviteDigest(0, m[1]));
        Circle.Sig memory pay;
        Circle.Sig[] memory rounds = _schedule(1);
        vm.expectRevert(bytes("Circle:slot-taken"));
        circle.join(0, m[1], invite, 0, pay, rounds);
        invite = _sig(inviteKey, circle.inviteDigest(1, m[0]));
        rounds = _schedule(0);
        vm.expectRevert(bytes("Circle:already-member"));
        circle.join(1, m[0], invite, 0, pay, rounds);
        for (uint256 i = 1; i < N; i++) _join(i);
        vm.expectRevert(bytes("Circle:started"));
        circle.join(1, m[0], invite, 0, pay, rounds);
    }

    function test_join_rejectsScheduleThatWouldNeverPay() public {
        Circle.Sig memory invite = _sig(inviteKey, circle.inviteDigest(0, m[0]));
        Circle.Sig memory pay = _sig(pk[0], _authDigest(m[0], 2 * C, block.timestamp + 1, circle.nonceFor(JOIN, m[0])));
        Circle.Sig[] memory rounds = _schedule(0);
        rounds[1] = _sig(pk[0], _authDigest(m[0], 1, type(uint256).max, circle.nonceFor(2, m[0])));
        vm.expectRevert(bytes("Circle:schedule-sig"));
        circle.join(0, m[0], invite, block.timestamp + 1, pay, rounds);
        Circle.Sig[] memory short = new Circle.Sig[](N - 2);
        vm.expectRevert(bytes("Circle:schedule"));
        circle.join(0, m[0], invite, block.timestamp + 1, pay, short);
    }

    function test_join_payAuthMustCoverRoundPlusSetAside() public {
        Circle.Sig memory invite = _sig(inviteKey, circle.inviteDigest(0, m[0]));
        Circle.Sig memory pay = _sig(pk[0], _authDigest(m[0], C, block.timestamp + 1, circle.nonceFor(JOIN, m[0])));
        Circle.Sig[] memory rounds = _schedule(0);
        vm.expectRevert();
        circle.join(0, m[0], invite, block.timestamp + 1, pay, rounds);
        assertEq(token.balanceOf(m[0]), WALLET, "nothing moved");
    }

    // ---------- guarantee ----------

    function test_bond_onlyTheOrganisersSignature_andLockedUntilEveryoneIsBack() public {
        Circle.Sig memory forged = _sig(pk[0], _authDigest(org, C, block.timestamp + 1, circle.bondNonce()));
        vm.expectRevert();
        circle.addBond(C, block.timestamp + 1, forged);
        _bond(3 * C);
        _bond(C);
        assertEq(circle.bond(), 4 * C);
        assertEq(token.balanceOf(org), WALLET - 4 * C);
        vm.expectRevert(bytes("Circle:bond-locked"));
        circle.returnBond();
        _joinAll();
        for (uint256 r; r < N; r++) _runRound(r);
        vm.expectRevert(bytes("Circle:set-asides-first"));
        circle.returnBond();
        _finish();
        assertEq(token.balanceOf(org), WALLET, "unused guarantee comes back whole");
    }

    // ---------- timing negatives ----------

    function test_payoutAndCollectRespectTheCalendar() public {
        vm.expectRevert(bytes("Circle:not-active"));
        circle.payout();
        _joinAll();
        vm.prank(relayer);
        circle.payout();
        vm.expectRevert(bytes("Circle:not-open"));
        circle.collect();
        vm.expectRevert(bytes("Circle:round-open"));
        circle.payout();
        vm.warp(circle.opensAt(1));
        _drain(3);
        circle.collect();
        assertEq(circle.paidCount(1), N - 1);
        vm.expectRevert(bytes("Circle:round-open"));
        circle.payout();
    }

    // ---------- defaults ----------

    function test_missedRound_coveredBySetAsideThenGuarantee_repaidAtTheirTurn() public {
        _bond(2 * C);
        _joinAll();
        _runRound(0);
        _drain(3); // slot 3 stops paying before round 1
        uint256 had1 = token.balanceOf(m[1]);
        _runRound(1);
        assertEq(token.balanceOf(m[1]), had1 - C + N * C, "round 1 collector paid in full (set-aside)");
        assertEq(circle.defaults(m[3]), 1, "the member who stopped is flagged");
        uint256 had2 = token.balanceOf(m[2]);
        _runRound(2);
        assertEq(token.balanceOf(m[2]), had2 - C + N * C, "round 2 collector paid in full (guarantee)");
        assertEq(circle.bond(), C);
        _runRound(3); // slot 3's own turn: its pot repays the guarantee and refills its set-aside first
        assertEq(circle.bond(), 2 * C, "guarantee repaid");
        assertEq(circle.owes(m[3]), 0);
        _runRound(4);
        _finish();
        for (uint256 i; i < N; i++) if (i != 3) assertEq(token.balanceOf(m[i]), WALLET, "honest members net zero");
        assertEq(token.balanceOf(org), WALLET, "organiser whole: the defaulter's own pot repaid her");
        assertEq(token.balanceOf(address(circle)), 0);
    }

    function test_cancelledAuthorizationIsADefault() public {
        _joinAll();
        _runRound(0);
        bytes32 nonce = circle.nonceFor(1, m[2]);
        bytes32 sh = keccak256(abi.encode(CANCEL_TYPEHASH, m[2], nonce));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(pk[2], keccak256(abi.encodePacked("\x19\x01", IAUSDExtra(AUSD).DOMAIN_SEPARATOR(), sh)));
        IAUSDExtra(AUSD).cancelAuthorization(m[2], nonce, v, r, s);
        vm.warp(circle.opensAt(1));
        assertEq(circle.collect(), N - 1, "the cancelled order does not pull");
        vm.warp(circle.dueAt(1) + 1);
        circle.payout();
        assertEq(circle.defaults(m[2]), 1);
    }

    function test_lateTopUp_manualPay_thenStandingOrderCannotDoubleCharge() public {
        _joinAll();
        _runRound(0);
        vm.warp(circle.opensAt(1));
        uint256 b = token.balanceOf(m[4]);
        _drain(4);
        circle.collect();
        assertFalse(circle.paid(1, m[4]));
        _fund(m[4], b);
        Circle.Sig memory sig = _sig(pk[4], _authDigest(m[4], C, block.timestamp + 1 hours, circle.nonceFor(1, m[4])));
        circle.contribute(m[4], 0, block.timestamp + 1 hours, sig);
        assertTrue(circle.paid(1, m[4]));
        vm.expectRevert(bytes("Circle:already-paid"));
        circle.contribute(m[4], 0, block.timestamp + 1 hours, sig);
        assertEq(circle.collect(), 0, "standing order for the same round no longer pulls");
        assertEq(token.balanceOf(m[4]), b - C, "charged exactly once");
    }

    /// No guarantee at all: the last slot skips every round before its turn. Each collector it shorted is repaid out of
    /// its own pot when its turn comes.
    function test_lastSlotSkipsEverything_noGuarantee_victimsRepaidFromItsPot() public {
        _joinAll();
        _runRound(0);
        _drain(4);
        for (uint256 r = 1; r < N; r++) _runRound(r);
        assertEq(circle.defaults(m[4]), N - 1);
        assertEq(circle.owes(m[4]), 0, "every debt repaid from its payout");
        _finish();
        for (uint256 i; i < 4; i++) assertEq(token.balanceOf(m[i]), WALLET, "honest members net zero");
        assertEq(token.balanceOf(address(circle)), 0);
    }

    /// Slot 0 collects first, then vanishes with the pot. Its set-aside covers one round and the organiser's
    /// guarantee the rest: every other member is whole and the organiser carries the loss she agreed to carry.
    function test_collectAndVanish_guaranteeMakesEveryoneElseWhole() public {
        _bond(3 * C);
        _joinAll();
        _runRound(0);
        for (uint256 r = 1; r < N; r++) {
            _drain(0);
            _runRound(r);
        }
        _finish();
        for (uint256 i = 1; i < N; i++) assertEq(token.balanceOf(m[i]), WALLET, "honest members net zero");
        assertEq(token.balanceOf(org), WALLET - 3 * C, "the organiser's guarantee absorbed exactly 3 rounds");
        assertEq(circle.defaults(m[0]), N - 1);
        assertEq(token.balanceOf(address(circle)), 0);
    }

    /// The same vanish with a guarantee too small: the shortfall lands on the collectors it could not cover, is recorded
    /// as debt against the member who vanished, and is exactly the uncovered rounds.
    function test_collectAndVanish_smallGuarantee_shortfallBoundedAndRecorded() public {
        _bond(C);
        _joinAll();
        _runRound(0);
        for (uint256 r = 1; r < N; r++) {
            _drain(0);
            _runRound(r);
        }
        _finish();
        uint256 lost;
        for (uint256 i = 1; i < N; i++) lost += WALLET - token.balanceOf(m[i]);
        assertEq(lost, 2 * C, "rounds 3 and 4 uncovered");
        assertEq(circle.owes(m[0]), 3 * C, "recorded against the member who vanished: 1 round to the guarantee, 2 to members");
        assertEq(token.balanceOf(address(circle)), 0);
    }

    // ---------- griefing ----------

    function test_lowGasCallerCannotForceADefault() public {
        _joinAll();
        _runRound(0);
        vm.warp(circle.dueAt(1) + 1);
        vm.prank(relayer);
        (bool ok,) = address(circle).call{gas: 400_000}(abi.encodeCall(Circle.payout, ()));
        assertFalse(ok, "starved payout reverts");
        assertEq(circle.round(), 1);
        circle.payout();
        for (uint256 i; i < N; i++) assertEq(circle.defaults(m[i]), 0, "funded members never flagged");
    }

    // ---------- fuzz ----------

    /// Random members stop paying at random rounds (some after collecting, some before), with a random guarantee.
    /// Always: money is conserved, nothing is stuck, the organiser loses at most what she posted, and with one
    /// defaulter and a guarantee of N-2 rounds every honest member nets exactly zero.
    function testFuzz_anyDefaultPattern(uint256 seed) public {
        uint256 bondRounds = seed % (N - 1);
        if (bondRounds > 0) _bond(bondRounds * C);
        uint256[N] memory stopAt;
        uint256 defaulters;
        for (uint256 i; i < N; i++) {
            uint256 x = uint256(keccak256(abi.encode(seed, i))) % (N * 3);
            stopAt[i] = x < N ? x : type(uint256).max;
            if (x < N) defaulters++;
        }
        uint256 before = _total();
        _joinAll();
        for (uint256 r; r < N; r++) {
            for (uint256 i; i < N; i++) if (stopAt[i] <= r) _drain(i); // a vanisher never pays again
            _runRound(r);
        }
        _finish();
        assertEq(_total(), before, "conserved");
        assertEq(token.balanceOf(address(circle)), 0, "nothing stuck");
        assertGe(token.balanceOf(org) + bondRounds * C, WALLET, "organiser loses at most her guarantee");
        if (defaulters == 1 && bondRounds >= N - 2) {
            for (uint256 i; i < N; i++) {
                if (stopAt[i] == type(uint256).max) assertEq(token.balanceOf(m[i]), WALLET, "honest nets zero");
            }
        }
    }
}
