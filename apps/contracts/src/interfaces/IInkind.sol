//SPDX-License-Identifier: LGPL-3.0

pragma solidity 0.8.23;

interface IInkind {
    struct InkindDetails {
        bytes32 inkind;
        uint256 amount;
        string meta;
    }

    function redeemInkind(address _vendor, address _beneficiary, uint256 _inkindsValue, InkindDetails[] calldata _inkinds) external;
}