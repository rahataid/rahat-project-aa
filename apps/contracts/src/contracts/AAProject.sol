//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

import '../libraries/AbstractProject.sol';
import '../interfaces/IAAProject.sol';
import '@openzeppelin/contracts/metatx/ERC2771Context.sol';
import '@openzeppelin/contracts/metatx/ERC2771Forwarder.sol';
import '@openzeppelin/contracts/utils/Multicall.sol';
import '../interfaces/IAccessManager.sol';

/// @title ELProject - Implementation of IELProject interface
/// @notice This contract implements the IELProject interface and provides functionalities for managing beneficiaries, claims, and referrals.
/// @dev This contract uses the ERC2771Context for meta-transactions and extends AbstractProject for basic project functionality.
contract ELProject is AbstractProject, IAAProject, ERC2771Context {
  using EnumerableSet for EnumerableSet.AddressSet;

  event ClaimAssigned(
    address indexed beneficiary,
    address indexed token,
    address indexed assigner
  );

  /// @dev Interface ID for IELProject
  bytes4 public constant IID_RAHAT_PROJECT = type(IAAProject).interfaceId;

  /// @dev access manager
  IAccessManager public AccessManager;

  /// @dev address of default token(free voucher address)
  address public defaultToken;

  /// @notice tracks the registered token address
  /// @dev key-value pair of voucher address and registered status
  mapping(address => bool) public registeredTokens;

  ///@notice constructor
  ///@param _name name of the project
  ///@param _defaultToken address of the default voucher(ERC20)
  ///@param _forwarder address of the forwarder contract
  ///@param _accessManager Access Manager contract address
  constructor(
    string memory _name,
    address _defaultToken,
    address _forwarder,
    address _accessManager
  ) AbstractProject(_name, msg.sender) ERC2771Context(_forwarder) {
    defaultToken = _defaultToken;
    AccessManager = IAccessManager(_accessManager);
  }

  modifier onlyAdmin() {
    require(AccessManager.isAdmin(_msgSender()), 'Only Admin can access');
    _;
  }

  modifier onlyProjectManager() {
    require(
      AccessManager.isProjectManager(msg.sender),
      'Only Project Manager can access'
    );
    _;
  }

  // #endregion
  function supportsInterface(
    bytes4 interfaceId
  ) public view virtual override returns (bool) {
    return interfaceId == IID_RAHAT_PROJECT;
  }

  ///@notice function to increase the tokenBudget
  ///@param _amount amount to increase the budget
  ///@param _tokenAddress address of the voucher to increase budget
  ///@dev can only be called by admin.Mainly called during minting of vouchers
  function increaseTokenBudget(
    address _tokenAddress,
    uint256 _amount
  ) public onlyAdmin {
    uint256 budget = tokenBudget(_tokenAddress);
    require(
      IERC20(_tokenAddress).totalSupply() >= budget + _amount,
      'Greater than total supply'
    );
    _tokenBudgetIncrease(_tokenAddress, _amount);
  }

  // region *****Beneficiary Functions *****//
  ///@notice function to add beneficiaries
  ///@param _address address of the beneficiary
  ///@dev can only be called by project admin when project is open
  function addBeneficiary(address _address) public onlyAdmin {
    _addBeneficiary(_address);
  }

  ///@notice function to remove beneficiaries
  ///@param _address address of the beneficiary to be removed
  ///@dev can only be called by project admin when project is open
  function removeBeneficiary(address _address) public onlyAdmin {
    _removeBeneficiary(_address);
  }

  ///@notice function to add status of  admin role
  ///@param _admin address of the admin
  ///@param _status boolean value for admin role
  ///@dev can only be called by project admin when project is open
  function updateAdmin(address _admin, bool _status) public onlyAdmin {
    _updateAdmin(_admin, _status);
  }

  ///@notice internal function to assign  voucher/claims to beneficiaries
  ///@param _beneficiary address of beneficiaires to assign claims
  ///@param _tokenAddress address of the voucher to assign
  ///@param _tokenAssigned amount of token assigned till date
  ///@dev internal function to assign claims
  function _assignClaims(
    address _beneficiary,
    address _tokenAddress,
    uint256 _tokenAssigned,
    address _assigner
  ) private {
    uint256 remainingBudget = tokenBudget(_tokenAddress);
    require(remainingBudget > _tokenAssigned, 'token budget exceed');
    emit ClaimAssigned(_beneficiary, _tokenAddress, _assigner);
  }

  // #endregion

  /// @dev overriding the method to ERC2771Context
  function _msgSender()
    internal
    view
    override(Context, ERC2771Context)
    returns (address sender)
  {
    sender = ERC2771Context._msgSender();
  }

  /// @dev overriding the method to ERC2771Context
  function _msgData()
    internal
    view
    override(Context, ERC2771Context)
    returns (bytes calldata)
  {
    return ERC2771Context._msgData();
  }

  function _contextSuffixLength()
    internal
    view
    override(Context, ERC2771Context)
    returns (uint256)
  {
    return ERC2771Context._contextSuffixLength();
  }

  //     modifier  {
  //     require(checkVendorStatus(_msgSender()), 'Only vendor can execute this transaction');
  //     _;
  //   }
}
