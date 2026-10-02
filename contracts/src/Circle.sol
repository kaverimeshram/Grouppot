// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAUSD {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
    function DOMAIN_SEPARATOR() external view returns (bytes32);
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/// Rotating savings circle (ajo, tanda, paluwagan). The organiser fixes the payout order as named slots and holds no
/// key over the money. A member claims a slot with the circle's invite key, and in the same signature set pays the
/// set-aside plus round 0 and leaves a standing ERC-3009 authorization for every later round, which anyone may pull
/// once that round opens. Rules:
///   - a collector never receives more than the cash they paid in plus the set-aside they locked at join;
///   - a missed round is covered from the member's set-aside, and whatever the set-aside cannot cover is a debt that
///     is repaid to that round's recipient out of the defaulter's own later payout or set-aside;
///   - set-asides are returned to every member after the last round, by anyone.
contract Circle {
    struct Sig {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Debt {
        address to;
        uint256 amount;
    }

    struct MemberView {
        address member;
        string label;
        bool paidThisRound;
        bool standing;
        uint256 cash;
        uint256 reserveLocked;
        uint256 reserveBal;
        uint256 defaults;
        uint256 owes;
    }

    struct View {
        string name;
        uint256 contribution;
        uint256 period;
        uint256 size;
        uint256 joined;
        uint256 start;
        uint256 round;
        uint256 paidCount;
        uint256 opensAt;
        uint256 dueAt;
        uint256 balance;
        MemberView[] members;
    }

    bytes32 internal constant RECEIVE_TYPEHASH =
        keccak256("ReceiveWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)");
    uint256 internal constant JOIN = type(uint256).max;
    uint256 internal constant HALF_N = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
    /// Gas handed to each standing pull, so a caller cannot starve one and turn a funded member into a defaulter.
    uint256 public constant PULL_GAS = 300_000;

    IAUSD public immutable token;
    address public immutable inviteSigner;
    uint256 public immutable contribution;
    uint256 public immutable period;
    uint256 public immutable size;

    string public name;
    string[] internal labels;
    address[] public members;
    mapping(address => uint256) internal slotPlusOne;
    uint256 public joined;
    uint256 public start;
    uint256 public round;

    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => uint256) public paidCount;
    mapping(address => uint256) public cash;
    mapping(address => uint256) public reserveLocked;
    mapping(address => uint256) public reserveBal;
    mapping(address => uint256) public defaults;
    mapping(address => mapping(uint256 => Sig)) internal standing;
    mapping(address => Debt[]) internal debts;
    mapping(address => uint256) internal debtHead;
    mapping(address => bool) public returned;
    mapping(uint256 => uint256) internal coveredPot;

    event Joined(address indexed member, uint256 slot, uint256 reserve);
    event Started(uint256 at);
    event Contributed(uint256 indexed round, address indexed member);
    event PullFailed(uint256 indexed round, address indexed member);
    event Covered(uint256 indexed round, address indexed member, uint256 fromReserve, uint256 uncovered);
    event Defaulted(uint256 indexed round, address indexed member);
    event Repaid(address indexed from, address indexed to, uint256 amount);
    event PaidOut(uint256 indexed round, address indexed to, uint256 amount, uint256 heldBack);
    event ReserveReturned(address indexed member, uint256 amount);

    constructor(
        address token_,
        address inviteSigner_,
        string memory name_,
        string[] memory labels_,
        uint256 contribution_,
        uint256 period_
    ) {
        uint256 n = labels_.length;
        require(n >= 2 && n <= 20, "Circle:size");
        require(contribution_ > 0 && period_ >= 60 && inviteSigner_ != address(0), "Circle:params");
        require(bytes(name_).length > 0 && bytes(name_).length <= 48, "Circle:name");
        for (uint256 i; i < n; i++) {
            require(bytes(labels_[i]).length > 0 && bytes(labels_[i]).length <= 32, "Circle:label");
            labels.push(labels_[i]);
            members.push(address(0));
        }
        token = IAUSD(token_);
        inviteSigner = inviteSigner_;
        name = name_;
        contribution = contribution_;
        period = period_;
        size = n;
    }

    // ---------- schedule ----------

    /// Set-aside a slot locks: what the slot's collector still owes after collecting, (N - 1 - slot) * C.
    function requiredReserve(uint256 slot) public view returns (uint256) {
        return (size - 1 - slot) * contribution;
    }

    /// What a member pays to join a slot: the set-aside plus round 0.
    function joinAmount(uint256 slot) public view returns (uint256) {
        return requiredReserve(slot) + contribution;
    }

    function opensAt(uint256 rd) public view returns (uint256) {
        return start + rd * period;
    }

    function dueAt(uint256 rd) public view returns (uint256) {
        return start + (rd + 1) * period;
    }

    /// ERC-3009 nonce a member signs for a round (JOIN for the join), binding the authorization to this circle.
    function nonceFor(uint256 rd, address member) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), rd, member));
    }

    /// Digest the invite key signs (EIP-191) to admit `member` to `slot`.
    function inviteDigest(uint256 slot, address member) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encode(address(this), slot, member))));
    }

    function slotOf(address member) public view returns (uint256) {
        uint256 s = slotPlusOne[member];
        require(s != 0, "Circle:not-member");
        return s - 1;
    }

    // ---------- join ----------

    /// Gasless join, submitted by anyone. `pay` authorizes joinAmount(slot) now; `rounds[i]` authorizes C for round i+1
    /// with validAfter 0 and validBefore max. Every signature is checked here, so a member cannot join with a schedule
    /// that would never pay.
    function join(uint256 slot, address member, Sig calldata invite, uint256 payValidBefore, Sig calldata pay, Sig[] calldata rounds)
        external
    {
        require(start == 0, "Circle:started");
        require(slot < size && members[slot] == address(0), "Circle:slot-taken");
        require(member != address(0) && slotPlusOne[member] == 0, "Circle:already-member");
        require(_recover(inviteDigest(slot, member), invite) == inviteSigner, "Circle:invite");
        require(rounds.length == size - 1, "Circle:schedule");

        _storeSchedule(member, rounds);

        members[slot] = member;
        slotPlusOne[member] = slot + 1;
        uint256 res = requiredReserve(slot);
        reserveLocked[member] = res;
        reserveBal[member] = res;
        paid[0][member] = true;
        paidCount[0]++;
        cash[member] = contribution;
        emit Joined(member, slot, res);
        emit Contributed(0, member);
        if (++joined == size) {
            start = block.timestamp;
            emit Started(block.timestamp);
        }
        token.receiveWithAuthorization(member, address(this), res + contribution, 0, payValidBefore, nonceFor(JOIN, member), pay.v, pay.r, pay.s);
    }

    // ---------- rounds ----------

    /// Manual payment for the current round with a fresh authorization (same nonce as the standing one, so the token
    /// itself makes a double payment impossible).
    function contribute(address member, uint256 validAfter, uint256 validBefore, Sig calldata sig) external {
        uint256 rd = round;
        _open(rd);
        slotOf(member);
        require(!paid[rd][member], "Circle:already-paid");
        _credit(rd, member);
        token.receiveWithAuthorization(member, address(this), contribution, validAfter, validBefore, nonceFor(rd, member), sig.v, sig.r, sig.s);
    }

    /// Pull every standing authorization due for the current round. Anyone may call once the round opens. A failed
    /// pull (empty wallet, cancelled authorization) leaves the member unpaid and can be retried until payout.
    function collect() external returns (uint256 pulled) {
        uint256 rd = round;
        _open(rd);
        require(block.timestamp >= opensAt(rd), "Circle:not-open");
        for (uint256 i; i < size; i++) {
            if (_tryPull(rd, members[i])) pulled++;
        }
    }

    /// Pays the scheduled slot. Anyone may call once every member has paid and the round is open, or once the round is
    /// due. Unpaid members are pulled one last time, then covered from their set-aside; any gap becomes their debt.
    function payout() external {
        uint256 rd = round;
        _open(rd);
        require((paidCount[rd] == size && block.timestamp >= opensAt(rd)) || block.timestamp > dueAt(rd), "Circle:round-open");
        address to = members[rd];

        for (uint256 i; i < size; i++) {
            address m = members[i];
            if (paid[rd][m] || _tryPull(rd, m)) continue;
            uint256 cover = reserveBal[m] < contribution ? reserveBal[m] : contribution;
            reserveBal[m] -= cover;
            uint256 gap = contribution - cover;
            if (gap > 0 && m != to) debts[m].push(Debt(to, gap));
            defaults[m]++;
            emit Covered(rd, m, cover, gap);
            emit Defaulted(rd, m);
            coveredPot[rd] += cover;
        }

        uint256 pot = paidCount[rd] * contribution + coveredPot[rd];
        uint256 cap = cash[to] + reserveLocked[to];
        uint256 amount = pot > cap ? cap : pot;
        uint256 excess = pot - amount;
        round = rd + 1;

        // the collector's own debts come out of what they were held back first, then out of the payout itself
        uint256 fromExcess;
        uint256 fromAmount;
        (fromExcess, fromAmount) = _settle(to, excess, amount);
        amount -= fromAmount;
        reserveBal[to] += excess - fromExcess;
        emit PaidOut(rd, to, amount, excess - fromExcess);
        if (amount > 0) require(token.transfer(to, amount), "Circle:push");
    }


    /// After the last round, returns a member's set-aside balance to them, settling anything they still owe first.
    function returnReserve(address member) external {
        slotOf(member);
        require(round == size, "Circle:running");
        require(!returned[member], "Circle:returned");
        returned[member] = true;
        uint256 bal = reserveBal[member];
        (uint256 used,) = _settle(member, bal, 0);
        bal -= used;
        reserveBal[member] = 0;
        emit ReserveReturned(member, bal);
        if (bal > 0) require(token.transfer(member, bal), "Circle:push");
    }

    // ---------- internals ----------

    function _storeSchedule(address member, Sig[] calldata rounds) internal {
        bytes32 domain = token.DOMAIN_SEPARATOR();
        for (uint256 i; i < rounds.length; i++) {
            bytes32 sh = keccak256(abi.encode(RECEIVE_TYPEHASH, member, address(this), contribution, 0, type(uint256).max, nonceFor(i + 1, member)));
            require(_recover(keccak256(abi.encodePacked("\x19\x01", domain, sh)), rounds[i]) == member, "Circle:schedule-sig");
            standing[member][i + 1] = rounds[i];
        }
    }

    function _open(uint256 rd) internal view {
        require(start != 0 && rd < size, "Circle:not-active");
    }

    function _credit(uint256 rd, address member) internal {
        paid[rd][member] = true;
        paidCount[rd]++;
        cash[member] += contribution;
        emit Contributed(rd, member);
    }

    function _tryPull(uint256 rd, address m) internal returns (bool) {
        if (paid[rd][m]) return false;
        Sig storage sig = standing[m][rd];
        if (sig.r == bytes32(0)) return false;
        require(gasleft() > PULL_GAS + PULL_GAS / 63 + 50_000, "Circle:gas");
        try token.receiveWithAuthorization{gas: PULL_GAS}(
            m, address(this), contribution, 0, type(uint256).max, nonceFor(rd, m), sig.v, sig.r, sig.s
        ) {
            _credit(rd, m);
            return true;
        } catch {
            emit PullFailed(rd, m);
            return false;
        }
    }

    /// Pays `who`'s debts in order, first from `a` then from `b`. Returns how much of each was used.
    function _settle(address who, uint256 a, uint256 b) internal returns (uint256 usedA, uint256 usedB) {
        Debt[] storage list = debts[who];
        uint256 h = debtHead[who];
        while (h < list.length && (a > usedA || b > usedB)) {
            Debt storage d = list[h];
            uint256 take = d.amount;
            uint256 fromA = a - usedA < take ? a - usedA : take;
            usedA += fromA;
            take -= fromA;
            uint256 fromB = b - usedB < take ? b - usedB : take;
            usedB += fromB;
            take -= fromB;
            uint256 paidNow = d.amount - take;
            d.amount = take;
            if (paidNow > 0) {
                emit Repaid(who, d.to, paidNow);
                require(token.transfer(d.to, paidNow), "Circle:push");
            }
            if (take > 0) break;
            h++;
        }
        debtHead[who] = h;
    }

    function _recover(bytes32 digest, Sig calldata sig) internal pure returns (address) {
        require(uint256(sig.s) <= HALF_N && (sig.v == 27 || sig.v == 28), "Circle:sig");
        address a = ecrecover(digest, sig.v, sig.r, sig.s);
        require(a != address(0), "Circle:sig");
        return a;
    }

    // ---------- reads ----------

    function owes(address member) public view returns (uint256 total) {
        Debt[] storage list = debts[member];
        for (uint256 i = debtHead[member]; i < list.length; i++) total += list[i].amount;
    }

    function hasStanding(address member, uint256 rd) external view returns (bool) {
        return standing[member][rd].r != bytes32(0);
    }

    /// Everything the app renders, in one call.
    function snapshot() external view returns (View memory v) {
        uint256 rd = round;
        v.name = name;
        v.contribution = contribution;
        v.period = period;
        v.size = size;
        v.joined = joined;
        v.start = start;
        v.round = rd;
        v.paidCount = rd < size ? paidCount[rd] : 0;
        v.opensAt = start == 0 ? 0 : opensAt(rd);
        v.dueAt = start == 0 ? 0 : dueAt(rd);
        v.balance = token.balanceOf(address(this));
        v.members = new MemberView[](size);
        for (uint256 i; i < size; i++) {
            address m = members[i];
            v.members[i] = MemberView({
                member: m,
                label: labels[i],
                paidThisRound: rd < size && paid[rd][m] && m != address(0),
                standing: m != address(0) && rd < size && standing[m][rd].r != bytes32(0),
                cash: cash[m],
                reserveLocked: reserveLocked[m],
                reserveBal: reserveBal[m],
                defaults: defaults[m],
                owes: owes(m)
            });
        }
    }
}
