//SPDX-License-Identifier: LGPL-3.0

pragma solidity 0.8.23;

import '../interfaces/IInkind.sol';
import '../interfaces/IRahatToken.sol';
import '@openzeppelin/contracts/access/manager/AccessManaged.sol';

/// @title Inkind - Implementation of IInkind interface
/// @notice This contract implements the IInkind interface and provides functionalities for redeeming inkind tokens and transferring tokens to vendors.
/// @dev This contract is designed to work with the AAProject and interacts with the AAProject contract for managing inkind token operations.

contract Inkind is IInkind, AccessManaged {
    address public defaultToken;

    //constructor - tokenaddress set
    constructor(
        address _defaultToken,
        address _accessManager
    ) AccessManaged(_accessManager) {
        defaultToken = _defaultToken;
    }

    event InkindRedeemed(
        InkindDetails[] inkindDetails,
        address indexed vendor,
        address indexed beneficiary
    );

    mapping(address => mapping(address => InkindDetails[]))
        public beneficiaryInkinds; // Mapping to track inkind tokens for each beneficiary

    /// @notice Function to redeem inkind tokens for a beneficiary from a vendor
    /// @param _inkinds The array of InkindDetails for the inkind tokens being redeemed
    /// @param _vendor The address of the vendor from which the inkind token is being redeemed
    /// @param _beneficiary The address of the beneficiary redeeming the inkind token
    function redeemInkind(
        address _vendor,
        address _beneficiary,
        uint256 _inkindsValue,
        InkindDetails[] calldata _inkinds
    ) external restricted {
        beneficiaryInkinds[_beneficiary][_vendor] = _inkinds; // Store the inkind details for the beneficiary and vendor
        emit InkindRedeemed(_inkinds, _vendor, _beneficiary); // Emit an event for the redemption of the inkind token
        IRahatToken(defaultToken).mint(_vendor, _inkindsValue); // Mint tokens for the vendor
    }
}
