# Setup

Install stellar cli:
brew install stellar-cli

# Step 1

Build the contract:
stellar contract build

# Step 2

Create a testnet account for entity alssice and fund:
stellar keys generate --global sushant --network testnet --fund

# Step 3

Deploy from compiled file:

This will deploy from compiled file hello_world.wasm

- Deployer -> alice
- Network -> Testnet
- Saves deployment config -> ./stellar/contract-ids/deployed_contract

stellar contract deploy \
 --wasm target/wasm32-unknown-unknown/release/soroban_contract.wasm \
 --source sushant \
 --network testnet \
 --alias deployed_contract

CONTRACT= CA6OBJRPX4ZJ7SWYB4YXLXLU4SLSPYUDYA44ACPVIRCGYYP5VXRGOKVX
