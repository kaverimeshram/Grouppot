// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Tab} from "../src/Tab.sol";
import {TabFactory} from "../src/TabFactory.sol";

interface IAUSD {
    function balanceOf(address who) external view returns (uint256);
}

interface IAUSDExtra {
    function DOMAIN_SEPARATOR() external view returns (bytes32);
}

/// Fork Monad testnet. Run: contracts/script/tab-test.sh
contract TabTest is Test {
    address immutable AUSD = vm.envOr("AUSD", address(0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC));
    bytes32 constant RECEIVE_TYPEHASH = 0xd099cc98ef71107a616c4f0f941f04c322d8e254fe26b3c6668db87aae413de8;

    TabFactory factory;
    Tab tab;
    address host;
    uint256 hostKey;
    address alice;
    uint256 aliceKey;
    address bob;
    uint256 bobKey;

    function setUp() public {
        (host, hostKey) = makeAddrAndKey("host");
        (alice, aliceKey) = makeAddrAndKey("alice");
        (bob, bobKey) = makeAddrAndKey("bob");
        _fund(host, 200e6);
        _fund(alice, 50e6);
        _fund(bob, 50e6);
        factory = new TabFactory(AUSD);
        address[] memory members = new address[](2);
        members[0] = alice;
        members[1] = bob;
        string[] memory labels = new string[](2);
        labels[0] = "Alice";
        labels[1] = "Bob";
        string[] memory items = new string[](1);
        items[0] = "Dinner";
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 60e6;
        uint256[] memory shares = new uint256[](2);
        shares[0] = 30e6;
        shares[1] = 30e6;
        tab = factory.create("Friday dinner", host, items, amounts, members, labels, shares);
    }

    function _fund(address who, uint256 amount) internal {
        vm.record();
        IAUSD(AUSD).balanceOf(who);
        (bytes32[] memory reads,) = vm.accesses(AUSD);
        vm.store(AUSD, reads[reads.length - 1], bytes32(amount << 8));
    }

    function _authDigest(address from, address to, uint256 value, uint256 validBefore, bytes32 nonce)
        internal
        view
        returns (bytes32)
    {
        bytes32 sh = keccak256(abi.encode(RECEIVE_TYPEHASH, from, to, value, 0, validBefore, nonce));
        return keccak256(abi.encodePacked("\x19\x01", IAUSDExtra(AUSD).DOMAIN_SEPARATOR(), sh));
    }

    function _nonce(address member) internal view returns (bytes32) {
        return keccak256(abi.encode("crew-settle", address(tab), member));
    }

    function _settle(address member, uint256 memberKey) internal {
        bytes32 nonce = _nonce(member);
        bytes32 digest = _authDigest(member, address(tab), tab.shareOf(member), type(uint256).max, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(memberKey, digest);
        tab.settleShare(member, 0, type(uint256).max, nonce, v, r, s);
    }

    function test_settle_each_share() public {
        uint256 hostBefore = IAUSD(AUSD).balanceOf(host);
        _settle(alice, aliceKey);
        _settle(bob, bobKey);
        assertTrue(tab.closed());
        assertEq(tab.paidSum(), 60e6);
        assertEq(IAUSD(AUSD).balanceOf(host), hostBefore + 60e6);
    }

    function test_cannot_settle_wrong_member() public {
        bytes32 nonce = _nonce(bob);
        bytes32 digest = _authDigest(alice, address(tab), tab.shareOf(alice), type(uint256).max, nonce);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(aliceKey, digest);
        vm.expectRevert();
        tab.settleShare(bob, 0, type(uint256).max, nonce, v, r, s);
        assertFalse(tab.paid(bob));
        assertFalse(tab.paid(alice));
    }

    /// With tab-mutation.sh, this test must fail until the guard is restored.
    function test_mutation_wrong_member_reverts() public {
        test_cannot_settle_wrong_member();
    }
}
