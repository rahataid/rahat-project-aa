// SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

import '@openzeppelin/contracts/access/manager/AccessManager.sol';

contract RahatAccessManager is AccessManager {
  //ADMIN_ROLE = 0;
  //PUBLIC_ROLE = max(uint64)
  //MINTER_ROLE = 1
  //MANAGER_ROLE = 2
  //

  constructor(address _manager) AccessManager(_manager) {}

  function isAdmin(address _address) public view returns (bool _isMember) {
    (_isMember, ) = hasRole(ADMIN_ROLE, _address);
  }
}
