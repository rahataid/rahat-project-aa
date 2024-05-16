//SPDX-License-Identifier: LGPL-3.0

pragma solidity 0.8.23;

import '@openzeppelin/contracts/utils/structs/EnumerableSet.sol';
import '../interfaces/ITriggerManager.sol';

contract TriggerManager is ITriggerManager {
  using EnumerableSet for EnumerableSet.AddressSet;
  using EnumerableSet for EnumerableSet.Bytes32Set;

  event TriggerSourceUpdated(
    bytes32 indexed sourceId,
    string sourceName,
    string sourceDetails,
    address triggerAddress
  );

  event TriggerInitialized(bytes32 indexed sourceId, address triggerAddress);

  EnumerableSet.Bytes32Set private triggerSourceIds;

  struct TriggerSource {
    string sourceName;
    string sourceDetails; //might not require
    address triggerAddress;
  }

  struct Trigger {
    bytes32 sourceId;
    address triggerAddress;
  }

  mapping(bytes32 => TriggerSource) public triggerSources;
  Trigger[] public triggers;

  uint256 public requiredTriggers;

  constructor(uint256 _requiredTriggers) {
    requiredTriggers = _requiredTriggers;
  }

  function updateTriggerSource(
    bytes32 sourceId,
    string memory sourceName,
    string memory sourceDetails,
    address triggerAddress
  ) public {
    triggerSourceIds.add(sourceId);
    triggerSources[sourceId] = TriggerSource({
      sourceName: sourceName,
      sourceDetails: sourceDetails,
      triggerAddress: triggerAddress
    });
    emit TriggerSourceUpdated(
      sourceId,
      sourceName,
      sourceDetails,
      triggerAddress
    );
  }

  function removeTriggerSource(bytes32 sourceId) public {
    triggerSourceIds.remove(sourceId);
    delete triggerSources[sourceId];
  }

  function trigger(bytes32 sourceId) public {
    require(triggerSourceIds.contains(sourceId), 'Invalid source');
    triggers.push(Trigger(sourceId, msg.sender));
    emit TriggerInitialized(sourceId, msg.sender);
  }

  function getTriggerCount() public view returns (uint256) {
    return triggers.length;
  }

  function setRequiredTriggers(uint256 _requiredTriggers) public {
    requiredTriggers = _requiredTriggers;
  }

  function hasTriggered() public view returns (bool) {
    return triggers.length >= requiredTriggers;
  }

  //   modifier onlyValidSource(uint256 sourceId) {
  //     require(isValidSource(msg.sender, sourceId), 'Invalid source');
  //     _;
  //   }

  //   modifier onlyAdmin() {
  //     require(isAdmin(msg.sender), 'Only admin can set required triggers');
  //     _;
  //   }
}
