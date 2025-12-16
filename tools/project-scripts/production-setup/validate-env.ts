import { PrismaService } from '@rumsan/prisma';
import { PrismaClient } from '@prisma/client';
import { JsonRpcProvider, Wallet } from 'ethers';
import axios from 'axios';
import * as dotenv from 'dotenv';
// Load environment variables from .env.setup if it exists, otherwise fallback to .env.prod, then .env
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config({ path: `${__dirname}/.env.prod` });
dotenv.config(); // Fallback to default .env

interface ValidationResult {
  name: string;
  status: 'success' | 'error' | 'warning';
  message: string;
}

class EnvironmentValidator {
  private results: ValidationResult[] = [];
  private hasErrors = false;

  private addResult(
    name: string,
    status: 'success' | 'error' | 'warning',
    message: string
  ) {
    this.results.push({ name, status, message });
    if (status === 'error') {
      this.hasErrors = true;
    }
  }

  private logResult(result: ValidationResult) {
    const icon =
      result.status === 'success'
        ? '✅'
        : result.status === 'error'
        ? '❌'
        : '⚠️';
    console.log(`${icon} ${result.name}: ${result.message}`);
  }

  // Required environment variables
  public validateRequiredEnvVars() {
    console.log('\n📋 Checking Required Environment Variables...\n');

    const requiredVars = [
      'PROJECT_UUID',
      'CHAIN_NAME',
      'CHAIN_RPCURL',
      'CHAIN_ID',
      'DEPLOYER_PRIVATE_KEY',
      'RAHAT_CORE_URL',
      'DATABASE_URL',
      // SUBGRAPH_PROVIDER is selected interactively, not from env
    ];

    // Note: Subgraph provider-specific vars will be validated during deployment
    // The provider is selected interactively in the CLI
    const optionalButRecommended = [
      'CHAIN_TYPE',
      'CHAIN_CURRENCY_NAME',
      'CHAIN_CURRENCY_SYMBOL',
      'CHAIN_EXPLORER_URL',
      'CORE_DATABASE_URL',
      'SUBGRAPH_QUERY_URL',
      'SUBGRAPH_PROJECT_ID', // For The Graph URL construction
      // Subgraph vars (provider-specific, validated during deployment):
      'SUBGRAPH_NETWORK', // Required for The Graph
      'SUBGRAPH_NAME', // Required for both
      'SUBGRAPH_AUTH_TOKEN', // Required for The Graph
      'SUBGRAPH_DEPLOY_KEY', // Required for Alchemy
      'SUBGRAPH_VERSION_LABEL', // Required for Alchemy
    ];

    // Check required variables
    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (!value || value.trim() === '') {
        this.addResult(
          `Required: ${varName}`,
          'error',
          `Missing or empty - This is required for deployment`
        );
      } else {
        // Mask sensitive values in logs
        const displayValue =
          varName.includes('KEY') ||
          varName.includes('PASSWORD') ||
          varName.includes('TOKEN')
            ? `${value.substring(0, 6)}...${value.substring(value.length - 4)}`
            : value;
        this.addResult(
          `Required: ${varName}`,
          'success',
          `Set (${displayValue})`
        );
      }
    }

    // Check optional but recommended
    for (const varName of optionalButRecommended) {
      const value = process.env[varName];
      if (!value || value.trim() === '') {
        this.addResult(
          `Optional: ${varName}`,
          'warning',
          'Not set - May cause issues in deployment'
        );
      } else {
        const displayValue =
          varName.includes('KEY') ||
          varName.includes('PASSWORD') ||
          varName.includes('TOKEN')
            ? `${value.substring(0, 6)}...${value.substring(value.length - 4)}`
            : value;
        this.addResult(
          `Optional: ${varName}`,
          'success',
          `Set (${displayValue})`
        );
      }
    }

    this.results.forEach((r) => this.logResult(r));
    return !this.hasErrors;
  }

  // Validate private key format
  public validatePrivateKey() {
    console.log('\n🔑 Validating Private Key Format...\n');

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      this.addResult('Private Key', 'error', 'DEPLOYER_PRIVATE_KEY is not set');
      this.logResult(this.results[this.results.length - 1]);
      return false;
    }

    try {
      // Check if it starts with 0x
      if (!privateKey.startsWith('0x')) {
        this.addResult(
          'Private Key Format',
          'error',
          'Private key must start with 0x'
        );
        this.logResult(this.results[this.results.length - 1]);
        return false;
      }

      // Check length (should be 66 characters: 0x + 64 hex chars)
      if (privateKey.length !== 66) {
        this.addResult(
          'Private Key Length',
          'error',
          `Invalid length: ${privateKey.length} (expected 66 characters)`
        );
        this.logResult(this.results[this.results.length - 1]);
        return false;
      }

      // Try to create a wallet with it
      try {
        const wallet = new Wallet(privateKey);
        const address = wallet.address;
        this.addResult('Private Key', 'success', `Valid - Address: ${address}`);
        this.logResult(this.results[this.results.length - 1]);
        return true;
      } catch (error: any) {
        this.addResult(
          'Private Key Validation',
          'error',
          `Invalid format: ${error.message}`
        );
        this.logResult(this.results[this.results.length - 1]);
        return false;
      }
    } catch (error: any) {
      this.addResult(
        'Private Key',
        'error',
        `Validation failed: ${error.message}`
      );
      this.logResult(this.results[this.results.length - 1]);
      return false;
    }
  }

  // Validate database connectivity
  public async validateDatabaseConnectivity() {
    console.log('\n🗄️  Validating Database Connectivity...\n');

    const results: boolean[] = [];

    // Validate project database
    const projectDbUrl = process.env.DATABASE_URL;
    if (projectDbUrl) {
      try {
        const prisma = new PrismaClient({ datasourceUrl: projectDbUrl });
        await prisma.$connect();
        await prisma.$queryRaw`SELECT 1`;
        await prisma.$disconnect();
        this.addResult('Project Database', 'success', 'Connected successfully');
        results.push(true);
      } catch (error: any) {
        this.addResult(
          'Project Database',
          'error',
          `Connection failed: ${error.message}`
        );
        results.push(false);
      }
    } else {
      this.addResult('Project Database', 'error', 'DATABASE_URL not set');
      results.push(false);
    }

    // Validate core database (optional but recommended)
    const coreDbUrl = process.env.CORE_DATABASE_URL;
    if (coreDbUrl) {
      try {
        const corePrisma = new PrismaClient({ datasourceUrl: coreDbUrl });
        await corePrisma.$connect();
        await corePrisma.$queryRaw`SELECT 1`;
        await corePrisma.$disconnect();
        this.addResult('Core Database', 'success', 'Connected successfully');
        results.push(true);
      } catch (error: any) {
        this.addResult(
          'Core Database',
          'warning',
          `Connection failed: ${error.message}`
        );
        results.push(false);
      }
    } else {
      this.addResult(
        'Core Database',
        'warning',
        'CORE_DATABASE_URL not set (optional)'
      );
    }

    this.results.slice(-results.length).forEach((r) => this.logResult(r));
    return results.every((r) => r);
  }

  // Validate blockchain RPC connectivity
  public async validateBlockchainRPC() {
    console.log('\n⛓️  Validating Blockchain RPC Connectivity...\n');

    const rpcUrl = process.env.CHAIN_RPCURL;
    const chainId = process.env.CHAIN_ID;

    if (!rpcUrl) {
      this.addResult('RPC URL', 'error', 'CHAIN_RPCURL is not set');
      this.logResult(this.results[this.results.length - 1]);
      return false;
    }

    try {
      const provider = new JsonRpcProvider(rpcUrl);

      // Test connection by getting block number
      const blockNumber = await provider.getBlockNumber();
      this.addResult(
        'RPC Connection',
        'success',
        `Connected - Current block: ${blockNumber}`
      );

      // Verify chain ID if provided
      if (chainId) {
        const network = await provider.getNetwork();
        const expectedChainId = parseInt(chainId, 10);
        if (network.chainId === BigInt(expectedChainId)) {
          this.addResult('Chain ID', 'success', `Matches: ${expectedChainId}`);
        } else {
          this.addResult(
            'Chain ID',
            'error',
            `Mismatch: Expected ${expectedChainId}, got ${network.chainId}`
          );
          this.logResult(this.results[this.results.length - 1]);
          return false;
        }
      }

      // Test if provider has enough balance concept (for fee estimation)
      try {
        const feeData = await provider.getFeeData();
        if (feeData.gasPrice) {
          this.addResult(
            'Gas Price',
            'success',
            `Available: ${feeData.gasPrice.toString()} wei`
          );
        }
      } catch (error) {
        this.addResult('Gas Price', 'warning', 'Could not fetch gas price');
      }

      this.results.slice(-3).forEach((r) => this.logResult(r));
      return true;
    } catch (error: any) {
      this.addResult(
        'RPC Connection',
        'error',
        `Connection failed: ${error.message}`
      );
      this.logResult(this.results[this.results.length - 1]);
      return false;
    }
  }

  // Validate Rahat Core API connectivity
  public async validateRahatCoreAPI() {
    console.log('\n🌐 Validating Rahat Core API Connectivity...\n');

    const coreUrl = process.env.RAHAT_CORE_URL;
    console.log('Using Core URL: ', coreUrl);
    if (!coreUrl) {
      this.addResult('Rahat Core URL', 'error', 'RAHAT_CORE_URL is not set');
      this.logResult(this.results[this.results.length - 1]);
      return false;
    }

    try {
      // Test connectivity by fetching CONTRACTS settings
      const url = `${coreUrl}/v1/settings/CONTRACTS`;
      const response = await axios.get(url, { timeout: 10000 });

      if (response.status === 200 && response.data) {
        this.addResult(
          'Rahat Core API',
          'success',
          `Connected - Settings endpoint accessible`
        );

        // Check if we have the required contracts
        const contracts = response.data?.data?.value;
        if (contracts) {
          const requiredContracts = [
            'RAHATACCESSMANAGER',
            'ERC2771FORWARDER',
            'RAHATTREASURY',
          ];
          const missing = requiredContracts.filter((name) => !contracts[name]);

          if (missing.length === 0) {
            this.addResult(
              'Core Contracts',
              'success',
              'All required contracts found'
            );
          } else {
            this.addResult(
              'Core Contracts',
              'warning',
              `Missing contracts: ${missing.join(', ')}`
            );
          }
        } else {
          this.addResult(
            'Core Contracts',
            'warning',
            'Could not verify core contracts'
          );
        }

        this.results.slice(-2).forEach((r) => this.logResult(r));
        return true;
      } else {
        this.addResult('Rahat Core API', 'error', 'Unexpected response format');
        this.logResult(this.results[this.results.length - 1]);
        return false;
      }
    } catch (error: any) {
      if (error.response) {
        this.addResult(
          'Rahat Core API',
          'error',
          `HTTP ${error.response.status}: ${error.response.statusText}`
        );
      } else if (error.request) {
        this.addResult(
          'Rahat Core API',
          'error',
          `Connection timeout or unreachable`
        );
      } else {
        this.addResult('Rahat Core API', 'error', `Error: ${error.message}`);
      }
      this.logResult(this.results[this.results.length - 1]);
      return false;
    }
  }

  // Validate deployment wallet has funds
  public async validateDeployerWallet() {
    console.log('\n💰 Validating Deployer Wallet Balance...\n');

    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    const rpcUrl = process.env.CHAIN_RPCURL;

    if (!privateKey || !rpcUrl) {
      this.addResult(
        'Wallet Validation',
        'error',
        'Missing DEPLOYER_PRIVATE_KEY or CHAIN_RPCURL'
      );
      this.logResult(this.results[this.results.length - 1]);
      return false;
    }

    try {
      const wallet = new Wallet(privateKey);
      const provider = new JsonRpcProvider(rpcUrl);
      const walletWithProvider = wallet.connect(provider);

      const address = wallet.address;
      const balance = await provider.getBalance(address);

      this.addResult('Wallet Address', 'success', `Address: ${address}`);

      if (balance === 0n) {
        this.addResult(
          'Wallet Balance',
          'error',
          'Balance is 0 - Wallet needs funds for gas fees'
        );
        this.logResult(this.results[this.results.length - 1]);
        return false;
      } else {
        const balanceInEth = Number(balance) / 1e18;
        this.addResult(
          'Wallet Balance',
          balanceInEth < 0.001 ? 'warning' : 'success',
          `Balance: ${balanceInEth.toFixed(6)} ETH (${balance.toString()} wei)`
        );
        this.results.slice(-2).forEach((r) => this.logResult(r));
        return balanceInEth >= 0.001;
      }
    } catch (error: any) {
      this.addResult('Wallet Validation', 'error', `Failed: ${error.message}`);
      this.logResult(this.results[this.results.length - 1]);
      return false;
    }
  }

  // Print summary
  public printSummary() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 Validation Summary');
    console.log('='.repeat(60) + '\n');

    const success = this.results.filter((r) => r.status === 'success').length;
    const warnings = this.results.filter((r) => r.status === 'warning').length;
    const errors = this.results.filter((r) => r.status === 'error').length;

    console.log(`✅ Passed: ${success}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`❌ Errors: ${errors}`);
    console.log(`📝 Total Checks: ${this.results.length}\n`);

    if (errors > 0) {
      console.log('❌ Validation FAILED - Please fix errors before proceeding');
      console.log('\nErrors found:');
      this.results
        .filter((r) => r.status === 'error')
        .forEach((r) => console.log(`  - ${r.name}: ${r.message}`));
      return false;
    } else if (warnings > 0) {
      console.log(
        '⚠️  Validation PASSED with warnings - Review warnings before deployment'
      );
      return true;
    } else {
      console.log('✅ Validation PASSED - Ready for deployment!');
      return true;
    }
  }

  public getResults() {
    return this.results;
  }

  public hasValidationErrors() {
    return this.hasErrors;
  }
}

async function main() {
  console.log('\n🔍 Starting Environment Validation...\n');
  console.log('='.repeat(60));

  const validator = new EnvironmentValidator();

  // Run all validations
  const envCheck = validator.validateRequiredEnvVars();

  if (!envCheck) {
    console.log(
      '\n❌ Required environment variables are missing. Please fix and try again.'
    );
    validator.printSummary();
    process.exit(1);
  }

  const privateKeyCheck = validator.validatePrivateKey();
  const dbCheck = await validator.validateDatabaseConnectivity();
  const rpcCheck = await validator.validateBlockchainRPC();
  const apiCheck = await validator.validateRahatCoreAPI();
  const walletCheck = await validator.validateDeployerWallet();

  // Print final summary
  const allPassed = validator.printSummary();

  if (!allPassed) {
    process.exit(1);
  } else {
    console.log(
      '\n✅ All validations passed. You can proceed with deployment.\n'
    );
    process.exit(0);
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error during validation:', error);
  process.exit(1);
});
