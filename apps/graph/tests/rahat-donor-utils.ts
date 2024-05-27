import { newMockEvent } from "matchstick-as"
import { ethereum, Address, BigInt } from "@graphprotocol/graph-ts"
import {
  OwnerAdded,
  OwnerRemoved,
  TokenCreated,
  TokenMintedAndApproved
} from "../generated/RahatDonor/RahatDonor"

export function createOwnerAddedEvent(param0: Address): OwnerAdded {
  let ownerAddedEvent = changetype<OwnerAdded>(newMockEvent())

  ownerAddedEvent.parameters = new Array()

  ownerAddedEvent.parameters.push(
    new ethereum.EventParam("param0", ethereum.Value.fromAddress(param0))
  )

  return ownerAddedEvent
}

export function createOwnerRemovedEvent(param0: Address): OwnerRemoved {
  let ownerRemovedEvent = changetype<OwnerRemoved>(newMockEvent())

  ownerRemovedEvent.parameters = new Array()

  ownerRemovedEvent.parameters.push(
    new ethereum.EventParam("param0", ethereum.Value.fromAddress(param0))
  )

  return ownerRemovedEvent
}

export function createTokenCreatedEvent(tokenAddress: Address): TokenCreated {
  let tokenCreatedEvent = changetype<TokenCreated>(newMockEvent())

  tokenCreatedEvent.parameters = new Array()

  tokenCreatedEvent.parameters.push(
    new ethereum.EventParam(
      "tokenAddress",
      ethereum.Value.fromAddress(tokenAddress)
    )
  )

  return tokenCreatedEvent
}

export function createTokenMintedAndApprovedEvent(
  tokenAddress: Address,
  approveAddress: Address,
  amount: BigInt
): TokenMintedAndApproved {
  let tokenMintedAndApprovedEvent = changetype<TokenMintedAndApproved>(
    newMockEvent()
  )

  tokenMintedAndApprovedEvent.parameters = new Array()

  tokenMintedAndApprovedEvent.parameters.push(
    new ethereum.EventParam(
      "tokenAddress",
      ethereum.Value.fromAddress(tokenAddress)
    )
  )
  tokenMintedAndApprovedEvent.parameters.push(
    new ethereum.EventParam(
      "approveAddress",
      ethereum.Value.fromAddress(approveAddress)
    )
  )
  tokenMintedAndApprovedEvent.parameters.push(
    new ethereum.EventParam("amount", ethereum.Value.fromUnsignedBigInt(amount))
  )

  return tokenMintedAndApprovedEvent
}
