# Use this script to deploy the contract to mainnet
# ./deploy-mainnet.sh <your_secret_key>

#!/bin/bash

set -e  # Exit on any error

# Configuration
CONTRACT_WASM_PATH="target/wasm32-unknown-unknown/release/soroban_contract.wasm"
CONTRACT_ALIAS="deployed_contract"
NETWORK="mainnet"
RPC_URL="https://mainnet.sorobanrpc.com"
NETWORK_PASSPHRASE="Public Global Stellar Network ; September 2015"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if source account is provided
if [ -z "$1" ]; then
    print_error "Usage: $0 <SOURCE_ACCOUNT_SECRET_KEY>"
    print_error "Example: $0 YOUR_SECRET_KEY_HERE"
    exit 1
fi

SOURCE_ACCOUNT=$1

# Check if WASM file exists
if [ ! -f "$CONTRACT_WASM_PATH" ]; then
    print_error "WASM file not found at: $CONTRACT_WASM_PATH"
    print_error "Please build the contract first using: stellar contract build"
    exit 1
fi

print_status "Starting contract deployment to mainnet..."
print_status "Contract WASM: $CONTRACT_WASM_PATH"
print_status "Network: $NETWORK"
print_status "RPC URL: $RPC_URL"
print_status "Contract Alias: $CONTRACT_ALIAS"

# Deploy the contract
print_status "Deploying contract..."

stellar contract deploy \
    --wasm "$CONTRACT_WASM_PATH" \
    --source-account "$SOURCE_ACCOUNT" \
    --network "$NETWORK" \
    --rpc-url "$RPC_URL" \
    --network-passphrase "$NETWORK_PASSPHRASE" \
    --alias "$CONTRACT_ALIAS"

if [ $? -eq 0 ]; then
    print_status "Contract deployed successfully!"
    print_status "You can now interact with your contract using the alias: $CONTRACT_ALIAS"
else
    print_error "Contract deployment failed!"
    exit 1
fi 