#!/bin/bash

for i in {1..5}
do
  echo "Run #$i: Deploying contract..."
  stellar contract deploy \
    --wasm target/wasm32-unknown-unknown/release/soroban_contract.wasm \
    --source sushantsTestnet \
    --network testnet \
    --alias deployed_contract
  echo "Run #$i completed."
done
