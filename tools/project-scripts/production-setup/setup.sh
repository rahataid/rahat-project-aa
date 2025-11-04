
#! /bin/sh
SCRIPT_DIR=$(dirname "$0")

get_env_value() {
  local var_name=$1
  # Try .env.setup first, then fallback to .env.prod
  local value=$(grep "^${var_name}=" "$SCRIPT_DIR/.env.setup" 2>/dev/null | cut -d '=' -f2)
  if [ -z "$value" ]; then
    value=$(grep "^${var_name}=" "$SCRIPT_DIR/.env.prod" 2>/dev/null | cut -d '=' -f2)
  fi
  echo "$value"
}

validate_environment() {
    echo "🔍 Validating environment..."
    npx ts-node "$SCRIPT_DIR/validate-env.ts"
    if [ $? -ne 0 ]; then
        echo "❌ Environment validation failed. Please fix errors and try again."
        exit 1
    fi
}

blockchain_setup() {
    echo "📦 Deploying contracts..."
    # Use new modular pipeline if available, fallback to legacy script
    if [ -f "$SCRIPT_DIR/pipelines/deploy-pipeline.ts" ]; then
        npx ts-node "$SCRIPT_DIR/pipelines/deploy-pipeline.ts"
    else
        npx ts-node "$SCRIPT_DIR/_setup-deployment.ts"
    fi
    if [ $? -ne 0 ]; then
        echo "❌ Contract deployment failed."
        exit 1
    fi
}

graph_setup() {
    echo "📊 Setting up graph subgraph..."
    
    # Use new modular graph setup script if available, fallback to legacy
    if [ -f "$SCRIPT_DIR/graph-setup.ts" ]; then
        echo "📝 Using modular graph setup..."
        npx ts-node "$SCRIPT_DIR/graph-setup.ts"
        if [ $? -ne 0 ]; then
            echo "⚠️  Modular graph setup failed, falling back to legacy script..."
            # Fall through to legacy script
        else
            return 0
        fi
    fi
    
    # Legacy fallback
    echo "📝 Using legacy graph setup..."
    npx ts-node "$SCRIPT_DIR/_modify-graph-contracts.ts"
    if [ $? -ne 0 ]; then
        echo "❌ Graph configuration failed."
        exit 1
    fi
    
    local SUBGRAPH_AUTH_TOKEN=$(get_env_value "SUBGRAPH_AUTH_TOKEN")
    local SUBGRAPH_NETWORK=$(get_env_value "SUBGRAPH_NETWORK")
    local SUBGRAPH_NAME=$(get_env_value "SUBGRAPH_NAME")
    
    if [ -z "$SUBGRAPH_AUTH_TOKEN" ] || [ -z "$SUBGRAPH_NETWORK" ] || [ -z "$SUBGRAPH_NAME" ]; then
        echo "⚠️  Subgraph configuration missing. Skipping graph codegen, build and deployment."
        return 0
    fi
    
    echo "🔨 Generating graph code..."
    cd "$SCRIPT_DIR/../../../" && pnpm graph:codegen
    if [ $? -ne 0 ]; then
        echo "❌ Graph code generation failed."
        exit 1
    fi
    
    echo "🏗️  Building graph..."
    cd "$SCRIPT_DIR/../../../" && pnpm graph:build
    if [ $? -ne 0 ]; then
        echo "❌ Graph build failed."
        exit 1
    fi
    
    echo "🔐 Authenticating with The Graph Studio..."
    npx graph auth --studio "$SUBGRAPH_AUTH_TOKEN"
    if [ $? -ne 0 ]; then
        echo "❌ Graph authentication failed."
        exit 1
    fi
    
    echo "🚀 Deploying subgraph..."
    cd "$SCRIPT_DIR/../../../apps/graph" && npx graph deploy --studio --network "$SUBGRAPH_NETWORK" "$SUBGRAPH_NAME"
    if [ $? -ne 0 ]; then
        echo "❌ Subgraph deployment failed."
        exit 1
    fi
    
    echo "📝 Updating subgraph endpoint in deployment file..."
    cd "$SCRIPT_DIR" && npx ts-node "$SCRIPT_DIR/update-subgraph-endpoint.ts"
    if [ $? -ne 0 ]; then
        echo "⚠️  Failed to update subgraph endpoint automatically."
        echo "   Please manually update the deployment file with the subgraph URL."
        echo "   Get the URL from: https://thegraph.com/studio/subgraph/$SUBGRAPH_NAME"
    fi
}

update_database() {
    echo "💾 Updating database with deployment info..."
    npx ts-node "$SCRIPT_DIR/update-deployment.ts"
    if [ $? -ne 0 ]; then
        echo "❌ Database update failed."
        exit 1
    fi
}

# Main execution flow
echo "🚀 Starting Production Deployment Setup..."
echo "=========================================="

validate_environment
blockchain_setup
graph_setup
update_database

echo ""
echo "✅ Deployment setup completed successfully!"
echo "=========================================="
