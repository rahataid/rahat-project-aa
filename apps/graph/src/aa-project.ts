import {
  BenTokensAssigned as BenTokensAssignedEvent,
  BeneficiaryAdded as BeneficiaryAddedEvent,
  BeneficiaryRemoved as BeneficiaryRemovedEvent,
  ClaimAssigned as ClaimAssignedEvent,
  TokenBudgetDecrease as TokenBudgetDecreaseEvent,
  TokenBudgetIncrease as TokenBudgetIncreaseEvent,
  TokenReceived as TokenReceivedEvent,
  TokenRegistered as TokenRegisteredEvent,
  TokenTransfer as TokenTransferEvent,
  VendorUpdated as VendorUpdatedEvent
} from "../generated/AAProject/AAProject"
import {
  BenTokensAssigned,
  BeneficiaryAdded,
  BeneficiaryRemoved,
  ClaimAssigned,
  TokenBudgetDecrease,
  TokenBudgetIncrease,
  TokenReceived,
  TokenRegistered,
  TokenTransfer,
  VendorUpdated
} from "../generated/schema"

export function handleBenTokensAssigned(event: BenTokensAssignedEvent): void {
  let entity = new BenTokensAssigned(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.beneficiary = event.params.beneficiary
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleBeneficiaryAdded(event: BeneficiaryAddedEvent): void {
  let entity = new BeneficiaryAdded(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.param0 = event.params.param0

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleBeneficiaryRemoved(event: BeneficiaryRemovedEvent): void {
  let entity = new BeneficiaryRemoved(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.param0 = event.params.param0

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleClaimAssigned(event: ClaimAssignedEvent): void {
  let entity = new ClaimAssigned(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.beneficiary = event.params.beneficiary
  entity.token = event.params.token
  entity.assigner = event.params.assigner

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTokenBudgetDecrease(
  event: TokenBudgetDecreaseEvent
): void {
  let entity = new TokenBudgetDecrease(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.tokenAddress = event.params.tokenAddress
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTokenBudgetIncrease(
  event: TokenBudgetIncreaseEvent
): void {
  let entity = new TokenBudgetIncrease(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.tokenAddress = event.params.tokenAddress
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTokenReceived(event: TokenReceivedEvent): void {
  let entity = new TokenReceived(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.token = event.params.token
  entity.from = event.params.from
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTokenRegistered(event: TokenRegisteredEvent): void {
  let entity = new TokenRegistered(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.tokenAddress = event.params.tokenAddress

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTokenTransfer(event: TokenTransferEvent): void {
  let entity = new TokenTransfer(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.token = event.params.token
  entity.to = event.params.to
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleVendorUpdated(event: VendorUpdatedEvent): void {
  let entity = new VendorUpdated(
    event.transaction.hash.concatI32(event.logIndex.toI32())
  )
  entity.vendorAddress = event.params.vendorAddress
  entity.status = event.params.status

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
