// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Circle} from "./Circle.sol";

/// Deploys circles on one token and keeps the list, so the app and the keeper find every circle with view calls
/// instead of log scans, and a relayer can refuse to spend gas on anything that is not one of these circles.
contract CircleFactory {
    address public immutable token;
    Circle[] public circles;
    mapping(address => bool) public isCircle;

    event CircleCreated(address indexed circle, address indexed organiser, string name, uint256 size, uint256 contribution, uint256 period);

    constructor(address token_) {
        token = token_;
    }

    function create(
        string calldata name,
        string[] calldata labels,
        uint256 contribution,
        uint256 period,
        address organiser,
        address inviteSigner
    )
        external
        returns (Circle c)
    {
        c = new Circle(token, organiser, inviteSigner, name, labels, contribution, period);
        circles.push(c);
        isCircle[address(c)] = true;
        emit CircleCreated(address(c), organiser, name, labels.length, contribution, period);
    }

    function count() external view returns (uint256) {
        return circles.length;
    }

    /// Circles [from, from + n), clipped to the list.
    function page(uint256 from, uint256 n) external view returns (address[] memory out) {
        uint256 end = from + n > circles.length ? circles.length : from + n;
        out = new address[](end > from ? end - from : 0);
        for (uint256 i = from; i < end; i++) out[i - from] = address(circles[i]);
    }
}
