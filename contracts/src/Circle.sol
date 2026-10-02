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
/// key over the money. A member claims a slot with the circle's invite key and, in one set of signatures, pays round 0
/// plus a one-round set-aside and leaves a standing ERC-3009 authorization for every later round, which anyone may pull
/// once that round opens. When a member misses a round:
///   1. their own set-aside covers it, then the organiser's guarantee, so the round's collector is paid in full;
///   2. anything neither covers is recorded as the defaulter's debt to that collector;
///   3. when the defaulter's own turn comes, their payout first repays every debt (the guarantee included) and refills
///      their set-aside, so skipping rounds before your turn never pays.
/// After the last round anyone returns each set-aside, debts settled first, and what is left of the guarantee.
contract Circle {
    struct Sig {
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct Debt {
        address to; // address(this) means the organiser's guarantee
        uint256 amount;
    }

    struct MemberView {
        address member;
        string label;
        bool paidThisRound;
        bool standing;
        uint256 cash;
        uint256 reserveBal;
        uint256 defaults;
        uint256 owes;
    }

    struct View {
        string name;
        address organiser;
        uint256 contribution;
        uint256 period;
        uint256 size;
        uint256 joined;
        uint256 start;
        uint256 round;
        uint256 paidCount;
        uint256 opensAt;
        uint256 dueAt;
        uint256 bond;
        uint256 bondPosted;
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
    address public immutable organiser;
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

    /// Organiser's guarantee: what is left of it now, and everything she has posted.
    uint256 public bond;
    uint256 public bondPosted;
    uint256 public bondAdds;
    bool public bondReturned;

    mapping(uint256 => mapping(address => bool)) public paid;
    mapping(uint256 => uint256) public paidCount;
    mapping(uint256 => uint256) internal coveredPot;
    mapping(address => uint256) public cash;
    mapping(address => uint256) public reserveBal;
    mapping(address => uint256) public defaults;
    mapping(address => mapping(uint256 => Sig)) internal standing;
    mapping(address => Debt[]) internal debts;
    mapping(address => uint256) internal debtHead;
    mapping(address => bool) public returned;
    /// How many times each address has joined, so a member who left can join again with a fresh authorization.
    mapping(address => uint256) public joins;

    event Joined(address indexed member, uint256 slot);
    event Left(address indexed member, uint256 slot, uint256 refunded);
    event BondWithdrawn(uint256 amount);
    event Started(uint256 at);
    event BondAdded(uint256 amount, uint256 total);
    event Contributed(uint256 indexed round, address indexed member);
    event PullFailed(uint256 indexed round, address indexed member);
    event Covered(uint256 indexed round, address indexed member, uint256 fromSetAside, uint256 fromGuarantee, uint256 uncovered);
    event Defaulted(uint256 indexed round, address indexed member);
    event Repaid(address indexed from, address indexed to, uint256 amount);
    event PaidOut(uint256 indexed round, address indexed to, uint256 amount);
    event SetAsideReturned(address indexed member, uint256 amount);
    event BondReturned(uint256 amount);

    constructor(
        address token_,
        address organiser_,
        address inviteSigner_,
        string memory name_,
        string[] memory labels_,
        uint256 contribution_,
        uint256 period_
    ) {
        uint256 n = labels_.length;
        require(n >= 2 && n <= 20, "Circle:size");
        require(contribution_ > 0 && period_ >= 60, "Circle:params");
        require(inviteSigner_ != address(0) && organiser_ != address(0), "Circle:params");
        require(bytes(name_).length > 0 && bytes(name_).length <= 48, "Circle:name");
        for (uint256 i; i < n; i++) {
            require(bytes(labels_[i]).length > 0 && bytes(labels_[i]).length <= 32, "Circle:label");
            labels.push(labels_[i]);
            members.push(address(0));
        }
        token = IAUSD(token_);
        organiser = organiser_;
        inviteSigner = inviteSigner_;
        name = name_;
        contribution = contribution_;
        period = period_;
        size = n;
    }

    // ---------- schedule ----------

    /// What a member pays to join: round 0 plus a one-round set-aside, returned after the last round.
    function joinAmount() public view returns (uint256) {
        return 2 * contribution;
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

    /// ERC-3009 nonce for `member`'s next join payment.
    function joinNonce(address member) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), JOIN, member, joins[member]));
    }

    /// Digest (EIP-191) a member signs to leave before the circle starts. Bound to this membership, so a member who
    /// leaves and joins again cannot be pushed out by the old signature.
    function leaveDigest(address member) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encode(address(this), "leave", member, joins[member]))));
    }

    /// Digest (EIP-191) the organiser signs to take her guarantee back before the circle starts.
    function bondExitDigest() public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encode(address(this), "bond-exit", bondAdds))));
    }

    /// ERC-3009 nonce for the organiser's next guarantee top-up.
    function bondNonce() public view returns (bytes32) {
        return keccak256(abi.encode(address(this), "bond", bondAdds));
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

    // ---------- organiser guarantee ----------

    /// Gasless top-up of the organiser's guarantee, any time before the last round is paid.
    function addBond(uint256 amount, uint256 validBefore, Sig calldata sig) external {
        require(amount > 0 && round < size, "Circle:bond");
        bytes32 nonce = bondNonce();
        bondAdds++;
        bond += amount;
        bondPosted += amount;
        emit BondAdded(amount, bond);
        token.receiveWithAuthorization(organiser, address(this), amount, 0, validBefore, nonce, sig.v, sig.r, sig.s);
    }

    // ---------- join ----------

    /// Gasless join, submitted by anyone. `pay` authorizes joinAmount() now; `rounds[i]` authorizes C for round i+1 with
    /// validAfter 0 and validBefore max. Every signature is checked here, so nobody joins with a schedule that would
    /// never pay.
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
        reserveBal[member] = contribution;
        paid[0][member] = true;
        paidCount[0]++;
        cash[member] = contribution;
        emit Joined(member, slot);
        emit Contributed(0, member);
        if (++joined == size) {
            start = block.timestamp;
            emit Started(block.timestamp);
        }
        bytes32 nonce = joinNonce(member);
        joins[member]++;
        token.receiveWithAuthorization(member, address(this), joinAmount(), 0, payValidBefore, nonce, pay.v, pay.r, pay.s);
    }

    /// Before the circle fills, a member may leave with everything they put in; their place opens again. Gasless: the
    /// member signs leaveDigest(member) and anyone submits it. Their unused standing orders are dropped.
    function leave(address member, Sig calldata sig) external {
        require(start == 0, "Circle:started");
        uint256 slot = slotOf(member);
        require(_recover(leaveDigest(member), sig) == member, "Circle:sig");
        uint256 amount = cash[member] + reserveBal[member];
        members[slot] = address(0);
        slotPlusOne[member] = 0;
        joined--;
        paid[0][member] = false;
        paidCount[0]--;
        cash[member] = 0;
        reserveBal[member] = 0;
        for (uint256 r = 1; r < size; r++) delete standing[member][r];
        emit Left(member, slot, amount);
        require(token.transfer(member, amount), "Circle:push");
    }

    /// Before the circle fills, the organiser may take her guarantee back (signed bondExitDigest()).
    function withdrawBond(Sig calldata sig) external {
        require(start == 0, "Circle:started");
        require(_recover(bondExitDigest(), sig) == organiser, "Circle:sig");
        bondAdds++;
        uint256 amount = bond;
        bond = 0;
        bondPosted = 0;
        emit BondWithdrawn(amount);
        if (amount > 0) require(token.transfer(organiser, amount), "Circle:push");
    }

    // ---------- rounds ----------

    /// Manual payment for the current round with a fresh authorization. It shares the standing order's nonce, so the
    /// token itself makes a double payment impossible.
    function contribute(address member, uint256 validAfter, uint256 validBefore, Sig calldata sig) external {
        uint256 rd = round;
        _active(rd);
        slotOf(member);
        require(!paid[rd][member], "Circle:already-paid");
        _credit(rd, member);
        token.receiveWithAuthorization(member, address(this), contribution, validAfter, validBefore, nonceFor(rd, member), sig.v, sig.r, sig.s);
    }

    /// Pull every standing authorization due this round. Anyone may call once the round opens. A failed pull (empty
    /// wallet, cancelled authorization) leaves the member unpaid and can be retried until payout.
    function collect() external returns (uint256 pulled) {
        uint256 rd = round;
        _active(rd);
        require(block.timestamp >= opensAt(rd), "Circle:not-open");
        for (uint256 i; i < size; i++) {
            if (_tryPull(rd, members[i])) pulled++;
        }
    }

    /// Pays the scheduled slot. Anyone may call once every member has paid and the round is open, or once the round is
    /// due. Unpaid members are pulled one last time, then covered.
    function payout() external {
        uint256 rd = round;
        _active(rd);
        require((paidCount[rd] == size && block.timestamp >= opensAt(rd)) || block.timestamp > dueAt(rd), "Circle:round-open");
        address to = members[rd];
        for (uint256 i; i < size; i++) {
            address m = members[i];
            if (!paid[rd][m] && !_tryPull(rd, m)) _cover(rd, m, to);
        }
        round = rd + 1;

        uint256 amount = paidCount[rd] * contribution + coveredPot[rd];
        // the collector's payout first repays what they skipped, then refills their set-aside
        amount -= _settle(to, amount);
        uint256 refill = contribution - reserveBal[to];
        if (refill > amount) refill = amount;
        reserveBal[to] += refill;
        amount -= refill;
        emit PaidOut(rd, to, amount);
        if (amount > 0) require(token.transfer(to, amount), "Circle:push");
    }

    /// After the last round, returns a member's set-aside, settling anything they still owe first.
    function returnSetAside(address member) external {
        slotOf(member);
        require(round == size, "Circle:running");
        require(!returned[member], "Circle:returned");
        returned[member] = true;
        uint256 bal = reserveBal[member];
        reserveBal[member] = 0;
        bal -= _settle(member, bal);
        emit SetAsideReturned(member, bal);
        if (bal > 0) require(token.transfer(member, bal), "Circle:push");
    }

    /// After the last round and once every set-aside is returned (so every debt that can be repaid has been), returns
    /// what is left of the guarantee to the organiser.
    function returnBond() external {
        require(round == size && !bondReturned, "Circle:bond-locked");
        for (uint256 i; i < size; i++) require(returned[members[i]], "Circle:set-asides-first");
        bondReturned = true;
        uint256 amount = bond;
        bond = 0;
        emit BondReturned(amount);
        if (amount > 0) require(token.transfer(organiser, amount), "Circle:push");
    }

    // ---------- internals ----------

    function _active(uint256 rd) internal view {
        require(start != 0 && rd < size, "Circle:not-active");
    }

    function _storeSchedule(address member, Sig[] calldata rounds) internal {
        bytes32 domain = token.DOMAIN_SEPARATOR();
        for (uint256 i; i < rounds.length; i++) {
            bytes32 sh = keccak256(abi.encode(RECEIVE_TYPEHASH, member, address(this), contribution, 0, type(uint256).max, nonceFor(i + 1, member)));
            require(_recover(keccak256(abi.encodePacked("\x19\x01", domain, sh)), rounds[i]) == member, "Circle:schedule-sig");
            standing[member][i + 1] = rounds[i];
        }
    }

    function _credit(uint256 rd, address member) internal {
        paid[rd][member] = true;
        paidCount[rd]++;
        cash[member] += contribution;
        emit Contributed(rd, member);
    }

    /// Member `m` missed round `rd`. A collector who misses their own round simply receives less.
    function _cover(uint256 rd, address m, address to) internal {
        defaults[m]++;
        emit Defaulted(rd, m);
        if (m == to) return;
        uint256 fromSetAside = reserveBal[m] < contribution ? reserveBal[m] : contribution;
        reserveBal[m] -= fromSetAside;
        uint256 gap = contribution - fromSetAside;
        uint256 fromGuarantee = bond < gap ? bond : gap;
        bond -= fromGuarantee;
        gap -= fromGuarantee;
        if (fromGuarantee > 0) debts[m].push(Debt(address(this), fromGuarantee));
        if (gap > 0) debts[m].push(Debt(to, gap));
        coveredPot[rd] += fromSetAside + fromGuarantee;
        emit Covered(rd, m, fromSetAside, fromGuarantee, gap);
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

    /// Pays `who`'s debts in the order they arose, out of `available`. Returns how much was used.
    function _settle(address who, uint256 available) internal returns (uint256 used) {
        Debt[] storage list = debts[who];
        uint256 h = debtHead[who];
        while (h < list.length && used < available) {
            Debt storage d = list[h];
            uint256 pay = available - used < d.amount ? available - used : d.amount;
            d.amount -= pay;
            used += pay;
            emit Repaid(who, d.to, pay);
            if (d.to == address(this)) bond += pay;
            else require(token.transfer(d.to, pay), "Circle:push");
            if (d.amount > 0) break;
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
        v.organiser = organiser;
        v.contribution = contribution;
        v.period = period;
        v.size = size;
        v.joined = joined;
        v.start = start;
        v.round = rd;
        v.paidCount = rd < size ? paidCount[rd] : 0;
        v.opensAt = start == 0 ? 0 : opensAt(rd);
        v.dueAt = start == 0 ? 0 : dueAt(rd);
        v.bond = bond;
        v.bondPosted = bondPosted;
        v.balance = token.balanceOf(address(this));
        v.members = new MemberView[](size);
        for (uint256 i; i < size; i++) {
            address m = members[i];
            v.members[i] = MemberView({
                member: m,
                label: labels[i],
                paidThisRound: m != address(0) && rd < size && paid[rd][m],
                standing: m != address(0) && rd < size && standing[m][rd].r != bytes32(0),
                cash: cash[m],
                reserveBal: reserveBal[m],
                defaults: defaults[m],
                owes: owes(m)
            });
        }
    }
}
