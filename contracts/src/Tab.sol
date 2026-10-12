// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IAUSD {
    function balanceOf(address who) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
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

/// Shared dinner tab: one total, fixed shares, each member pays the host with their own ERC-3009 signature.
contract Tab {
    struct Item {
        string label;
        uint256 amount;
    }

    struct MemberView {
        address member;
        string label;
        uint256 share;
        bool paid;
    }

    struct View {
        string name;
        address host;
        uint256 total;
        uint256 paidSum;
        uint256 balance;
        Item[] items;
        MemberView[] members;
        bool closed;
    }

    IAUSD public immutable token;
    address public immutable host;
    string public name;
    uint256 public immutable total;
    uint256 public paidSum;
    bool public closed;

    Item[] internal items;
    address[] internal memberAddrs;
    string[] internal memberLabels;
    mapping(address => uint256) public shareOf;
    mapping(address => bool) public paid;

    event ShareSettled(address indexed member, uint256 amount, address indexed payer);

    error TabClosed();
    error NotMember();
    error AlreadyPaid();
    error WrongAmount();
    error WrongPayee();
    error BadSplit();
    error BadNonce();

    constructor(
        address token_,
        address host_,
        string memory name_,
        string[] memory itemLabels,
        uint256[] memory itemAmounts,
        address[] memory members_,
        string[] memory labels_,
        uint256[] memory shares_
    ) {
        if (members_.length != labels_.length || members_.length != shares_.length) revert BadSplit();
        token = IAUSD(token_);
        host = host_;
        name = name_;
        uint256 sum;
        for (uint256 i; i < itemAmounts.length; i++) {
            items.push(Item({label: itemLabels[i], amount: itemAmounts[i]}));
            sum += itemAmounts[i];
        }
        total = sum;
        uint256 shareSum;
        for (uint256 j; j < members_.length; j++) {
            address m = members_[j];
            if (m == address(0)) revert BadSplit();
            memberAddrs.push(m);
            memberLabels.push(labels_[j]);
            shareOf[m] = shares_[j];
            shareSum += shares_[j];
        }
        if (shareSum != total) revert BadSplit();
    }

    function snapshot() external view returns (View memory v) {
        v.name = name;
        v.host = host;
        v.total = total;
        v.paidSum = paidSum;
        v.balance = token.balanceOf(address(this));
        v.closed = closed;
        v.items = items;
        uint256 n = memberAddrs.length;
        v.members = new MemberView[](n);
        for (uint256 i; i < n; i++) {
            address m = memberAddrs[i];
            v.members[i] = MemberView({member: m, label: memberLabels[i], share: shareOf[m], paid: paid[m]});
        }
    }

    /// Pull one member's share to the host. The ERC-3009 authorization must be signed by `member`.
    function settleShare(
        address member,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (closed) revert TabClosed();
        uint256 amount = shareOf[member];
        if (amount == 0) revert NotMember();
        if (paid[member]) revert AlreadyPaid();
        bytes32 expected = keccak256(abi.encode("crew-settle", address(this), member));
        if (nonce != expected) revert BadNonce();
        token.receiveWithAuthorization(member, address(this), amount, validAfter, validBefore, nonce, v, r, s);
        require(token.transfer(host, amount), "transfer");
        paid[member] = true;
        paidSum += amount;
        emit ShareSettled(member, amount, msg.sender);
        if (paidSum == total) closed = true;
    }

    /// Host deposits the full bill into the tab so the UI can show one pooled balance (optional).
    function fundFromHost(uint256 amount) external {
        if (msg.sender != host) revert NotMember();
        if (amount == 0) revert WrongAmount();
        require(token.transfer(address(this), amount), "transfer");
    }
}
