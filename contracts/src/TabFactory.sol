// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Tab} from "./Tab.sol";

contract TabFactory {
    address public immutable token;
    address[] public tabs;

    event TabCreated(address indexed tab, address indexed host, string name);

    constructor(address token_) {
        token = token_;
    }

    function create(
        string calldata name,
        address host,
        string[] calldata itemLabels,
        uint256[] calldata itemAmounts,
        address[] calldata members,
        string[] calldata labels,
        uint256[] calldata shares
    ) external returns (Tab tab) {
        tab = _deployTab(name, host, itemLabels, itemAmounts, members, labels, shares);
        tabs.push(address(tab));
        emit TabCreated(address(tab), host, name);
    }

    function _deployTab(
        string calldata name,
        address host,
        string[] calldata itemLabels,
        uint256[] calldata itemAmounts,
        address[] calldata members,
        string[] calldata labels,
        uint256[] calldata shares
    ) private returns (Tab tab) {
        tab = new Tab(token, host, name, itemLabels, itemAmounts, members, labels, shares);
    }

    function tabCount() external view returns (uint256) {
        return tabs.length;
    }
}
