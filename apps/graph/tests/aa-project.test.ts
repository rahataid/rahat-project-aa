import {
  assert,
  describe,
  test,
  clearStore,
  beforeAll,
  afterAll
} from "matchstick-as/assembly/index"
import { Address, BigInt } from "@graphprotocol/graph-ts"
import { BenTokensAssigned } from "../generated/schema"
import { BenTokensAssigned as BenTokensAssignedEvent } from "../generated/AAProject/AAProject"
import { handleBenTokensAssigned } from "../src/aa-project"
import { createBenTokensAssignedEvent } from "./aa-project-utils"

// Tests structure (matchstick-as >=0.5.0)
// https://thegraph.com/docs/en/developer/matchstick/#tests-structure-0-5-0

describe("Describe entity assertions", () => {
  beforeAll(() => {
    let beneficiary = Address.fromString(
      "0x0000000000000000000000000000000000000001"
    )
    let amount = BigInt.fromI32(234)
    let newBenTokensAssignedEvent = createBenTokensAssignedEvent(
      beneficiary,
      amount
    )
    handleBenTokensAssigned(newBenTokensAssignedEvent)
  })

  afterAll(() => {
    clearStore()
  })

  // For more test scenarios, see:
  // https://thegraph.com/docs/en/developer/matchstick/#write-a-unit-test

  test("BenTokensAssigned created and stored", () => {
    assert.entityCount("BenTokensAssigned", 1)

    // 0xa16081f360e3847006db660bae1c6d1b2e17ec2a is the default address used in newMockEvent() function
    assert.fieldEquals(
      "BenTokensAssigned",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "beneficiary",
      "0x0000000000000000000000000000000000000001"
    )
    assert.fieldEquals(
      "BenTokensAssigned",
      "0xa16081f360e3847006db660bae1c6d1b2e17ec2a-1",
      "amount",
      "234"
    )

    // More assert options:
    // https://thegraph.com/docs/en/developer/matchstick/#asserts
  })
})
