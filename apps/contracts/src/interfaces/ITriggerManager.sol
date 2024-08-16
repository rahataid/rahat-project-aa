// SPDX-License-Identifier: LGPL-3.0

pragma solidity 0.8.23;

interface ITriggerManager {
  function updateTriggerSource(
    bytes32 sourceId,
    string memory sourceName,
    string memory sourceDetails,
    address triggerAddress
  ) external;

  function removeTriggerSource(bytes32 sourceId) external;

  function trigger(bytes32 sourceId) external;

  function getTriggerCount() external view returns (uint256);

  function setRequiredTriggers(uint256 _requiredTriggers) external;

  function hasTriggered() external view returns (bool);
}
