//SPDX-License-Identifier: LGPL-3.0
pragma solidity 0.8.23;

import '@openzeppelin/contracts/utils/introspection/IERC165.sol';

interface IRahatProject is IERC165 {
  function name() external view returns (string memory);

  function isLocked() external view returns (bool);

  function lockProject() external;

  function unlockProject() external;

  function community() external view returns (address);

  function addBeneficiary(address _address) external;

  function removeBeneficiary(address _address) external;

  function isBeneficiary(address _address) external view returns (bool);

  function beneficiaryCount() external view returns (uint256);

  function tokenBudget(address _tokenAddress) external view returns (uint);
}
