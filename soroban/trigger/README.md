# Soroban Contract Setup Guide

## Prerequisites

### Install Stellar CLI

```bash
brew install stellar-cli
```

### Install Rust and WebAssembly Target

To install Rust on macOS, run:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Add the WebAssembly compilation target:

```bash
rustup target add wasm32-unknown-unknown
```

## Deployment Steps

### Step 1: Build the Contract

```bash
stellar contract build
```

### Step 2: Create and Fund a Testnet Account

Create a new testnet account and fund it with test tokens:

```bash
stellar keys generate --global sushant --network testnet --fund
```

### Step 3: Deploy the Contract

Deploy the compiled contract to the testnet:

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/soroban_contract.wasm \
  --source sushant \
  --network testnet \
  --alias deployed_contract
```

**Parameters:**

- **Deployer:** `sushant` (the account created in Step 2)
- **Network:** Testnet
- **Contract Alias:** `deployed_contract`

After successful deployment, the contract ID will be displayed and saved to `./stellar/contract-ids/deployed_contract`.

### Example Contract ID

```
CONTRACT_ID=CDIESPF2SHPYTXTAM4EW55TD4DIIMSYBRS72CCRQH2UDCL4IS4KOZEMK
```

## Next Steps

Once deployed, you can interact with your contract using the Stellar CLI or integrate it into your application using the Stellar SDK.

## For mainnet

# 1. Set up mainnet RPC

stellar network add mainnet \
 --rpc-url "https://mainnet.sorobanrpc.com" \
 --network-passphrase "Public Global Stellar Network ; September 2015" \
 --global

# 2. Deploy your contract

stellar contract deploy \
 --wasm target/wasm32-unknown-unknown/release/soroban_contract.wasm \
 --source your_secret_key \
 --network mainnet
