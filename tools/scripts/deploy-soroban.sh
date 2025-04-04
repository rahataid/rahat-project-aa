CURRENT_DIR="$PWD"
SOROBAN_DIR="$CURRENT_DIR/contract/trigger"
WASM_OUTPUT="$CURRENT_DIR/contract/trigger/target/wasm32-unknown-unknown/release/hello_world.wasm"
DEPLOY_ALIAS="deployed_contract"
ENTITY="alice"

check_soroban_cli() {
    if ! command -v stellar &> /dev/null; then
        echo "Soroban CLI not found. Installing..."
        brew install stellar-cli || {
            echo "Homebrew installation failed."
            exit 1
        }
    else
        echo "Soroban CLI is already installed."
    fi
}

build_contract() {
    echo "Building Soroban contract..."
    cd "$SOROBAN_DIR" || exit
    stellar contract build
    if [ $? -ne 0 ]; then
        echo "Contract build failed."
        exit 1
    fi
    echo "Contract built successfully at $WASM_OUTPUT"
    cd "$CURRENT_DIR"
}

setup_testnet_account() {
    echo "Checking if testnet account for $ENTITY exists..."
    if stellar keys show --global "$ENTITY" &> /dev/null; then
        echo "Account for $ENTITY already exists. Skipping generation and funding."
    else
        echo "Generating and funding testnet account for $ENTITY..."
        soroban keys generate --global "$ENTITY" --network testnet --fund
        if [ $? -ne 0 ]; then
            echo "Failed to generate or fund account."
            exit 1
        fi
        echo "Account for $ENTITY created and funded on testnet."
    fi
}

deploy_contract() {
    echo "Deploying contract..."
    stellar contract deploy \
        --wasm "$WASM_OUTPUT" \
        --source "$ENTITY" \
        --network testnet \
        --alias "$DEPLOY_ALIAS"
    if [ $? -ne 0 ]; then
        echo "Deployment failed."
        exit 1
    fi
    echo "Contract deployed successfully. Deployment config saved to ./stellar/contract-ids/$DEPLOY_ALIAS"
}

soroban_deploy() {
    check_soroban_cli
    build_contract
    setup_testnet_account
    deploy_contract
    echo "Soroban contract deployment completed!"
}

echo "Soroban contract deployment completed!"