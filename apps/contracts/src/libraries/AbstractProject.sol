// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.23;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/utils/Multicall.sol';
import '@openzeppelin/contracts/metatx/ERC2771Context.sol';
import '../interfaces/IRahatProject.sol';
import '../interfaces/IRahatToken.sol';

abstract contract AbstractProject is Multicall {
  using EnumerableSet for EnumerableSet.AddressSet;

  // #region ***** Events *********//
  event BeneficiaryAdded(address indexed);
  event BeneficiaryRemoved(address indexed);
  event TokenRegistered(address indexed tokenAddress);
  event TokenBudgetIncrease(address indexed tokenAddress, uint amount);
  event TokenBudgetDecrease(address indexed tokenAddress, uint amount);
  event TokenReceived(address indexed token, address indexed from, uint amount);
  event TokenTransfer(address indexed token, address indexed to, uint amount);
  event VendorUpdated(address indexed vendorAddress, bool status);
  // #endregion

  // #region ***** Variables *********//
  bool internal _closed;
  mapping(address => uint) private _tokenBudget;
  mapping(address => bool) private _registeredTokens;
  mapping(address => bool) private _vendor;

  string public name;
  // bool public override isLocked;

  // IRahatCommunity public RahatCommunity;
  EnumerableSet.AddressSet internal _beneficiaries;

  // #endregion

  constructor(string memory _name) {
    name = _name;
    // RahatCommunity = IRahatCommunity(_community);
  }

  modifier onlyOpen() {
    require(!_closed, 'Project closed');
    _;
  }

  modifier onlyRegisteredToken(address _tokenAddress) {
    require(_registeredTokens[_tokenAddress], 'Token not registered');
    _;
  }

  // #region ***** Beneficiary Functions *********//
  function isBeneficiary(address _address) public view virtual returns (bool) {
    return _beneficiaries.contains(_address);
  }

  function beneficiaryCount() public view virtual returns (uint256) {
    return _beneficiaries.length();
  }

  function registerToken(address _token) internal {
    _registeredTokens[_token] = true;
  }

  function _addBeneficiary(address _address) internal {
    // require(RahatCommunity.isBeneficiary(_address), 'not valid ben');
    if (!_beneficiaries.contains(_address)) emit BeneficiaryAdded(_address);
    _beneficiaries.add(_address);
  }

  function _removeBeneficiary(address _address) internal {
    if (_beneficiaries.contains(_address)) emit BeneficiaryRemoved(_address);
    _beneficiaries.remove(_address);
  }

  function _updateVendorStatus(address _address, bool _status) internal {
    _vendor[_address] = _status;
    emit VendorUpdated(_address, _status);
  }

  function checkVendorStatus(
    address _address
  ) public view virtual returns (bool _vendorStatus) {
    return _vendor[_address];
  }

  // #endregion

  // #region ***** Token Functions *********//
  function tokenBudget(
    address _tokenAddress
  ) public view virtual returns (uint) {
    return _tokenBudget[_tokenAddress];
  }

  function _tokenBudgetIncrease(address _tokenAddress, uint _amount) internal {
    _tokenBudget[_tokenAddress] += _amount;
    emit TokenBudgetIncrease(_tokenAddress, _amount);

    if (!_registeredTokens[_tokenAddress]) {
      _registeredTokens[_tokenAddress] = true;
      emit TokenRegistered(_tokenAddress);
    }
  }

  function _tokenBudgetDecrease(address _tokenAddress, uint _amount) internal {
    _tokenBudget[_tokenAddress] -= _amount;
    emit TokenBudgetDecrease(_tokenAddress, _amount);
  }

  function _acceptToken(
    address _tokenAddress,
    address _from,
    uint256 _amount
  ) internal {
    // require(RahatCommunity.isProject(address(this)), 'project not approved');

    IERC20(_tokenAddress).transferFrom(_from, address(this), _amount);
    _tokenBudgetIncrease(_tokenAddress, _amount);
    emit TokenReceived(_tokenAddress, _from, _amount);
  }

  function _withdrawToken(
    address _tokenAddress,
    uint _amount,
    address _to
  ) internal {
    IERC20(_tokenAddress).transfer(_to, _amount);
    _tokenBudgetDecrease(_tokenAddress, _amount);
    emit TokenTransfer(_tokenAddress, _to, _amount);
  }

  function close() internal {
    _closed = true;
  }

  // #endregion

  // // #region ***** Misc Functions *********//
  // function community() public view virtual returns (address) {
  //   return address(RahatCommunity);
  // }
  // // #endregion
}
