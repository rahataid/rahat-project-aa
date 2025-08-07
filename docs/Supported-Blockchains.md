# Supported Blockchains

This document provides detailed information about the blockchain networks supported by the Rahat Anticipatory Action platform, including Stellar Soroban, EVM-compatible networks, and their integration patterns.

## Overview

The platform supports dual blockchain architecture, allowing deployment on both Stellar Soroban and EVM-compatible networks. This provides flexibility in choosing the most suitable blockchain for specific use cases and regional requirements.

## Architecture

### Core Components

#### 1. Chain Service Interface
- **Purpose**: Abstract blockchain operations
- **Location**: `apps/aa/src/chain/interfaces/chain-service.interface.ts`
- **Features**: Unified interface for different blockchain implementations

#### 2. Stellar Integration
- **Purpose**: Primary blockchain for token operations
- **Features**: Soroban smart contracts, native asset management
- **SDK**: Stellar SDK with Soroban support

#### 3. EVM Integration
- **Purpose**: Alternative blockchain deployment options
- **Features**: Solidity smart contracts, DeFi integration
- **SDK**: Ethers.js for EVM-compatible networks

## 1. Stellar Network

### Overview
Stellar is the primary blockchain for the platform, offering fast transactions, low costs, and native asset support. The platform leverages Stellar's Soroban smart contract platform for advanced functionality.

### Key Features

#### Transaction Characteristics
- **Finality**: 3-5 seconds
- **Transaction Cost**: ~0.00001 XLM per operation
- **Throughput**: 1,000+ transactions per second
- **Consensus**: Stellar Consensus Protocol (SCP)

#### Asset Management
```typescript
// Stellar asset configuration
interface StellarAsset {
  code: 'RAHAT';
  issuer: string; // Stellar account that issues the asset
  network: 'TESTNET' | 'PUBLIC';
  decimals: 7;
}
```

### Smart Contracts (Soroban)

#### Contract Structure
```rust
// soroban/trigger/contracts/trigger-manager/src/lib.rs
#[contract]
pub struct TriggerManager;

#[contractimpl]
impl TriggerManager {
    pub fn initialize(env: Env, admin: Address) -> Result<(), Error> {
        // Initialize contract with admin
        Ok(())
    }

    pub fn create_trigger(
        env: Env,
        trigger_id: String,
        conditions: Vec<String>,
        actions: Vec<String>
    ) -> Result<(), Error> {
        // Create new trigger with conditions and actions
        Ok(())
    }

    pub fn execute_trigger(env: Env, trigger_id: String) -> Result<(), Error> {
        // Execute trigger when conditions are met
        Ok(())
    }
}
```

#### Contract Deployment
```bash
# Build Soroban contract
cd soroban/trigger
stellar contract build

# Deploy to Stellar network
stellar contract deploy --network testnet target/wasm32-unknown-unknown/release/trigger_manager.wasm
```

### Stellar Service Integration

#### Service Structure
```typescript
// apps/aa/src/stellar/stellar.service.ts
@Injectable()
export class StellarService {
  constructor(
    private readonly receiveService: ReceiveService,
    private readonly transactionService: TransactionService,
    private readonly disbursementServices: DisbursementServices
  ) {}

  async transferTokens(data: TransferTokensDto): Promise<any> {
    return this.transactionService.transferTokens(
      data.fromAddress,
      data.toAddress,
      data.amount,
      data.assetCode
    );
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    return this.receiveService.fundAccount(
      data.address,
      data.amount,
      data.assetCode
    );
  }

  async disburse(data: DisburseDto): Promise<any> {
    return this.disbursementServices.disburse(data);
  }
}
```

#### Token Operations
```typescript
// Token transfer operations
async transferTokensToBeneficiary(
  fromAddress: string,
  toAddress: string,
  amount: number
): Promise<TransactionResult> {
  const result = await this.stellarService.transferTokens({
    fromAddress,
    toAddress,
    amount,
    assetCode: 'RAHAT',
    assetIssuer: process.env.STELLAR_ASSET_ISSUER
  });

  return {
    transactionHash: result.hash,
    status: 'success',
    amount,
    fromAddress,
    toAddress
  };
}
```

### Stellar Configuration

#### Environment Settings
```typescript
// Stellar settings configuration
interface StellarSettings {
  ASSETCREATOR: string;
  ASSETCODE: string;
  NETWORK: 'TESTNET' | 'PUBLIC';
  FAUCETSECRETKEY: string;
  FUNDINGAMOUNT: string;
  HORIZONURL: string;
  BASEURL: string;
  ADMINBASEURL: string;
  EMAIL: string;
  PASSWORD: string;
  TENANTNAME: string;
}
```

#### Network Configuration
```typescript
// Network-specific settings
const stellarNetworks = {
  testnet: {
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
    assetIssuer: 'test-asset-issuer-address'
  },
  public: {
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: 'Public Global Stellar Network ; September 2015',
    assetIssuer: 'production-asset-issuer-address'
  }
};
```

## 2. EVM-Compatible Networks

### Overview
EVM (Ethereum Virtual Machine) compatible networks provide alternative deployment options with extensive DeFi ecosystem integration and established tooling.

### Supported Networks

#### 1. Polygon (Amoy Testnet)
- **Chain ID**: 80002
- **Currency**: MATIC
- **Block Time**: ~2 seconds
- **Gas Limit**: 30M
- **Features**: Low fees, fast finality

#### 2. Arbitrum (Sepolia Testnet)
- **Chain ID**: 421614
- **Currency**: ETH
- **Block Time**: ~1 second
- **Gas Limit**: 30M
- **Features**: Layer 2 scaling, low fees

#### 3. Ethereum (Mainnet)
- **Chain ID**: 1
- **Currency**: ETH
- **Block Time**: ~12 seconds
- **Gas Limit**: 30M
- **Features**: Maximum security, established ecosystem

### Smart Contracts (Solidity)

#### Contract Structure
```solidity
// apps/contracts/src/contracts/AAProject.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract AAProject is ERC20, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant TRIGGER_ROLE = keccak256("TRIGGER_ROLE");

    mapping(bytes32 => Trigger) public triggers;
    mapping(address => bool) public beneficiaries;

    struct Trigger {
        bool isActive;
        uint256 threshold;
        uint256 amount;
        string conditions;
    }

    event TriggerExecuted(bytes32 indexed triggerId, address indexed beneficiary, uint256 amount);
    event BeneficiaryAdded(address indexed beneficiary);
    event TriggerCreated(bytes32 indexed triggerId, uint256 threshold, uint256 amount);

    constructor() ERC20("Rahat Token", "RAHAT") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
    }

    function createTrigger(
        bytes32 triggerId,
        uint256 threshold,
        uint256 amount,
        string memory conditions
    ) external onlyRole(ADMIN_ROLE) {
        triggers[triggerId] = Trigger(true, threshold, amount, conditions);
        emit TriggerCreated(triggerId, threshold, amount);
    }

    function executeTrigger(bytes32 triggerId, address beneficiary) external onlyRole(TRIGGER_ROLE) {
        require(triggers[triggerId].isActive, "Trigger not active");
        require(beneficiaries[beneficiary], "Not a beneficiary");

        uint256 amount = triggers[triggerId].amount;
        _mint(beneficiary, amount);

        emit TriggerExecuted(triggerId, beneficiary, amount);
    }

    function addBeneficiary(address beneficiary) external onlyRole(ADMIN_ROLE) {
        beneficiaries[beneficiary] = true;
        emit BeneficiaryAdded(beneficiary);
    }
}
```

#### Contract Deployment
```typescript
// apps/contracts/scripts/deploy.js
async function deployAAProject() {
  const AAProject = await ethers.getContractFactory("AAProject");
  const aaProject = await AAProject.deploy();
  await aaProject.deployed();

  console.log("AAProject deployed to:", aaProject.address);
  return aaProject;
}

// Deploy to specific network
async function deployToNetwork(networkName) {
  const network = await ethers.providers.getNetwork();
  
  if (network.chainId === 80002) { // Polygon Amoy
    console.log("Deploying to Polygon Amoy testnet");
  } else if (network.chainId === 421614) { // Arbitrum Sepolia
    console.log("Deploying to Arbitrum Sepolia testnet");
  }
  
  return await deployAAProject();
}
```

### EVM Service Integration

#### Chain Service Implementation
```typescript
// apps/aa/src/chain/chain-services/evm.service.ts
@Injectable()
export class EvmService implements IChainService {
  private provider: ethers.providers.Provider;
  private signer: ethers.Signer;
  private contract: ethers.Contract;

  constructor() {
    this.provider = new ethers.providers.JsonRpcProvider(
      process.env.NETWORK_PROVIDER
    );
    this.signer = new ethers.Wallet(
      process.env.DEPLOYER_PRIVATE_KEY,
      this.provider
    );
  }

  async assignTokens(data: AssignTokensDto): Promise<any> {
    const contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      AAProjectABI,
      this.signer
    );

    const tx = await contract.addBeneficiary(data.beneficiaryAddress);
    await tx.wait();

    return {
      transactionHash: tx.hash,
      status: 'success'
    };
  }

  async transferTokens(data: TransferTokensDto): Promise<any> {
    const contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      AAProjectABI,
      this.signer
    );

    const tx = await contract.transfer(
      data.toAddress,
      data.amount
    );
    await tx.wait();

    return {
      transactionHash: tx.hash,
      status: 'success'
    };
  }

  async disburse(data: DisburseDto): Promise<any> {
    const contract = new ethers.Contract(
      process.env.CONTRACT_ADDRESS,
      AAProjectABI,
      this.signer
    );

    const tx = await contract.executeTrigger(
      data.triggerId,
      data.beneficiaryAddress
    );
    await tx.wait();

    return {
      transactionHash: tx.hash,
      status: 'success'
    };
  }

  validateAddress(address: string): boolean {
    return ethers.utils.isAddress(address);
  }

  getChainType(): ChainType {
    return 'evm';
  }
}
```

### EVM Configuration

#### Environment Variables
```bash
# EVM Configuration
NETWORK_PROVIDER=https://polygon-amoy.infura.io/v3/YOUR_PROJECT_ID
CHAIN_NAME=Polygon Amoy
CHAIN_ID=80002
CURRENCY_NAME=MATIC
CURRENCY_SYMBOL=MATIC
DEPLOYER_PRIVATE_KEY=your_private_key
CONTRACT_ADDRESS=deployed_contract_address
```

#### Network Configuration
```typescript
// Network configurations
const evmNetworks = {
  polygonAmoy: {
    name: 'Polygon Amoy',
    chainId: 80002,
    rpcUrl: 'https://polygon-amoy.infura.io/v3/YOUR_PROJECT_ID',
    currency: 'MATIC',
    explorer: 'https://www.oklink.com/amoy'
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc',
    currency: 'ETH',
    explorer: 'https://sepolia.arbiscan.io'
  },
  ethereum: {
    name: 'Ethereum',
    chainId: 1,
    rpcUrl: 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
    currency: 'ETH',
    explorer: 'https://etherscan.io'
  }
};
```

## Chain Selection Strategy

### When to Use Stellar Soroban

#### Advantages
- **Low Transaction Costs**: ~0.00001 XLM per operation
- **Fast Finality**: 3-5 second transaction confirmation
- **Native Asset Support**: Built-in asset creation and management
- **Emerging Markets**: Better suited for developing regions
- **Regulatory Compliance**: Easier compliance in certain jurisdictions

#### Use Cases
- **Micro-transactions**: Small value transfers
- **High-frequency Operations**: Frequent trigger executions
- **Cost-sensitive Applications**: Where transaction costs matter
- **Asset-backed Tokens**: Native asset management

### When to Use EVM Networks

#### Advantages
- **DeFi Integration**: Extensive DeFi ecosystem
- **Established Tooling**: Mature development tools
- **Cross-chain Compatibility**: Interoperability with other EVM chains
- **Advanced Smart Contracts**: Complex contract logic support
- **Liquidity**: Access to large liquidity pools

#### Use Cases
- **Complex DeFi Operations**: Advanced financial products
- **Cross-chain Applications**: Multi-chain interoperability
- **Established Ecosystems**: Integration with existing DeFi protocols
- **High-value Transactions**: Where security is paramount

## Cross-Chain Operations

### Chain Registry System
```typescript
// apps/aa/src/chain/chain-queue-registry/chain-queue-registry.service.ts
@Injectable()
export class ChainQueueRegistryService {
  private chainServices: Map<ChainType, IChainService> = new Map();

  registerChain(chainType: ChainType, service: IChainService) {
    this.chainServices.set(chainType, service);
  }

  getChainService(chainType: ChainType): IChainService {
    const service = this.chainServices.get(chainType);
    if (!service) {
      throw new Error(`Chain service not found for type: ${chainType}`);
    }
    return service;
  }

  async executeOnChain(chainType: ChainType, operation: ChainOperation): Promise<any> {
    const service = this.getChainService(chainType);
    
    switch (operation.type) {
      case 'TRANSFER_TOKENS':
        return service.transferTokens(operation.data);
      case 'DISBURSE':
        return service.disburse(operation.data);
      case 'FUND_ACCOUNT':
        return service.fundAccount(operation.data);
      default:
        throw new Error(`Unknown operation type: ${operation.type}`);
    }
  }
}
```

### Multi-Chain Configuration
```typescript
// apps/aa/src/chain/chain-queue-registry/chain-queue-registry.module.ts
@Module({
  imports: [
    StellarModule,
    EvmModule,
    BullModule.registerQueue({
      name: BQUEUE.CHAIN_OPERATIONS,
    }),
  ],
  providers: [
    ChainQueueRegistryService,
    {
      provide: 'CHAIN_SERVICES',
      useFactory: (
        stellarService: StellarService,
        evmService: EvmService,
        registryService: ChainQueueRegistryService
      ) => {
        registryService.registerChain('stellar', stellarService);
        registryService.registerChain('evm', evmService);
        return registryService;
      },
      inject: [StellarService, EvmService, ChainQueueRegistryService],
    },
  ],
  exports: [ChainQueueRegistryService],
})
export class ChainQueueRegistryModule {}
```

## Security Considerations

### Private Key Management
```typescript
// Secure private key handling
interface KeyManagement {
  stellar: {
    adminSecretKey: string; // Stored securely
    assetIssuerSecretKey: string;
  };
  evm: {
    deployerPrivateKey: string; // Stored securely
    adminPrivateKey: string;
  };
}
```

### Transaction Signing
```typescript
// Secure transaction signing
async signTransaction(transaction: any, chainType: ChainType): Promise<any> {
  switch (chainType) {
    case 'stellar':
      return this.signStellarTransaction(transaction);
    case 'evm':
      return this.signEvmTransaction(transaction);
    default:
      throw new Error(`Unsupported chain type: ${chainType}`);
  }
}
```

## Monitoring and Analytics

### Blockchain Metrics
```typescript
interface BlockchainMetrics {
  stellar: {
    totalTransactions: number;
    averageTransactionTime: number;
    totalTokensIssued: number;
    activeBeneficiaries: number;
  };
  evm: {
    totalTransactions: number;
    gasUsed: number;
    averageGasPrice: number;
    contractInteractions: number;
  };
}
```

### Transaction Monitoring
```typescript
async monitorTransaction(transactionHash: string, chainType: ChainType) {
  const service = this.getChainService(chainType);
  
  return {
    hash: transactionHash,
    status: await service.getTransactionStatus(transactionHash),
    confirmations: await service.getConfirmations(transactionHash),
    timestamp: await service.getTransactionTimestamp(transactionHash)
  };
}
```

## Testing

### Unit Tests
```typescript
describe('Chain Services', () => {
  it('should transfer tokens on Stellar', async () => {
    const result = await stellarService.transferTokens({
      fromAddress: 'GABC123456789',
      toAddress: 'GDEF987654321',
      amount: 1000,
      assetCode: 'RAHAT'
    });
    
    expect(result.status).toBe('success');
    expect(result.transactionHash).toBeDefined();
  });

  it('should execute trigger on EVM', async () => {
    const result = await evmService.disburse({
      triggerId: 'flood-warning-001',
      beneficiaryAddress: '0x1234567890abcdef'
    });
    
    expect(result.status).toBe('success');
    expect(result.transactionHash).toBeDefined();
  });
});
```

### Integration Tests
```typescript
describe('Cross-Chain Operations', () => {
  it('should execute operation on correct chain', async () => {
    const result = await chainRegistry.executeOnChain('stellar', {
      type: 'TRANSFER_TOKENS',
      data: {
        fromAddress: 'GABC123456789',
        toAddress: 'GDEF987654321',
        amount: 1000
      }
    });
    
    expect(result.chainType).toBe('stellar');
    expect(result.status).toBe('success');
  });
});
```

## Future Enhancements

### Planned Features
1. **Cross-Chain Bridges**: Seamless asset transfer between chains
2. **Layer 2 Solutions**: Enhanced scalability for EVM networks
3. **Advanced Smart Contracts**: More complex trigger logic
4. **Multi-Signature Support**: Enhanced security for high-value operations
5. **Chain-Specific Optimizations**: Performance improvements for each chain
6. **Automated Chain Selection**: Intelligent chain selection based on requirements

### Scalability Improvements
- **Sharding Support**: Multi-chain parallel processing
- **Gas Optimization**: Efficient contract execution
- **Batch Operations**: Bulk transaction processing
- **Caching**: Frequently accessed blockchain data
- **Load Balancing**: Distributed chain operations 