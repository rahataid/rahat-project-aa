// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import './AAProject.sol';
import '../interfaces/IAccessManager.sol';
import '@openzeppelin/contracts/utils/Multicall.sol';

contract AccessManager is IAccessManager, Multicall {
  mapping(address => bool) private _admin;
  mapping(address => bool) private _donor;
  mapping(address => bool) private _projectManager;

  constructor(address[] memory _adminAddress) {
    for (uint256 i = 0; i < _adminAddress.length; i++) {
      _admin[_adminAddress[i]] = true;
    }
  }

  modifier onlyAdmin(address _adminAddress) {
    require(_admin[_adminAddress], 'not an admin');
    _;
  }

  function updateAdmin(
    address _address,
    bool _status
  ) public onlyAdmin(msg.sender) {
    _admin[_address] = _status;
  }

  function updateDonor(
    address _address,
    bool _status
  ) public onlyAdmin(msg.sender) {
    _donor[_address] = _status;
  }

  function updateProjectManager(
    address _address,
    bool _status
  ) public onlyAdmin(msg.sender) {
    _projectManager[_address] = _status;
  }

  function isAdmin(
    address _address
  ) public view virtual returns (bool _status) {
    return _admin[_address];
  }

  function isDonor(
    address _address
  ) public view virtual returns (bool _status) {
    return _donor[_address] || _admin[_address];
  }

  function isProjectManager(
    address _address
  ) public view virtual returns (bool _status) {
    return _projectManager[_address] || _admin[_address];
  }
}
