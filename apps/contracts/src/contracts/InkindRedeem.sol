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
        bytes16 indexed inkind,
        address indexed vendor,
        address indexed beneficiary
    );

    mapping(bytes16 => address) public redeemedInkind; // Mapping to track redeemed inkind tokens
    mapping(address => address) public beneficiaryVendors; // Mapping to track the vendor associated with each beneficiary

    /// @notice Function to redeem inkind tokens for a beneficiary from a vendor
    /// @param _inkind The address of the inkind token being redeemed
    /// @param _vendor The address of the vendor from which the inkind token is being redeemed
    /// @param _beneficiary The address of the beneficiary redeeming the inkind token
    function redeemInkind(
        bytes16[] calldata _inkind,
        address _vendor,
        address _beneficiary
    ) external restricted {
        for (uint i = 0; i < _inkind.length; i++) {
            redeemedInkind[_inkind[i]] = _beneficiary; // Store the redeemed inkind tokens for the beneficiary
            emit InkindRedeemed(_inkind[i], _vendor, _beneficiary); // Emit an event for the redemption of the inkind token
        }

        beneficiaryVendors[_beneficiary] = _vendor; // Associate the beneficiary with the vendor
        IRahatToken(defaultToken).mint(_vendor, _inkind.length); // Mint tokens for the beneficiary
    }
}
