import {
  OwnerAdded as OwnerAddedEvent,
  OwnerRemoved as OwnerRemovedEvent,
  TokenCreated as TokenCreatedEvent,
  TokenMintedAndApproved as TokenMintedAndApprovedEvent,
} from "../generated/RahatDonor/RahatDonor"
import {
  OwnerAdded,
  OwnerRemoved,
  TokenCreated,
  TokenMintedAndApproved,
} from "../generated/schema"

export function handleOwnerAdded(event: OwnerAddedEvent): void {
  let entity = new OwnerAdded(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.param0 = event.params.param0

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleOwnerRemoved(event: OwnerRemovedEvent): void {
  let entity = new OwnerRemoved(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.param0 = event.params.param0

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTokenCreated(event: TokenCreatedEvent): void {
  let entity = new TokenCreated(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.tokenAddress = event.params.tokenAddress

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}

export function handleTokenMintedAndApproved(
  event: TokenMintedAndApprovedEvent,
): void {
  let entity = new TokenMintedAndApproved(
    event.transaction.hash.concatI32(event.logIndex.toI32()),
  )
  entity.tokenAddress = event.params.tokenAddress
  entity.approveAddress = event.params.approveAddress
  entity.amount = event.params.amount

  entity.blockNumber = event.block.number
  entity.blockTimestamp = event.block.timestamp
  entity.transactionHash = event.transaction.hash

  entity.save()
}
