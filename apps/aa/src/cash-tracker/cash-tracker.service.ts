import { Injectable, Logger } from '@nestjs/common';
import {
  CashTokenSDK,
  SDKConfig,
  TokenBalance,
  TokenAllowance,
  TransactionResult,
  EntityConfig,
  TokenFlowData,
  CashTokenAbi,
  EVMUtils,
  MintTokenRequest,
  ContractConfig,
  EVMProviderConfig,
} from '@rahataid/cash-tracker';
import { ethers } from 'ethers';
import { SettingsService } from '@rumsan/settings';
import { MintTokenRequestDto } from './dto/mint-token.dto';
import { EVMProcessor } from '../processors/evm.processor';
import { RpcException } from '@nestjs/microservices';

export interface CashTrackerConfig {
  network: {
    rpcUrl: string;
    entryPoint: string;
  };
  contracts: {
    cashToken: string;
    smartAccountFactory?: string;
  };
}

export interface ExecuteActionRequest {
  from: string; // smart address
  to?: string; // smart address (optional for get_cash_balance)
  alias: string;
  action:
    | 'give_cash_allowance'
    | 'get_cash_from'
    | 'get_cash_approved_by_me'
    | 'get_cash_balance'
    | 'create_budget'
    | 'initiate_transfer'
    | 'confirm_transfer'
    | 'approve'
    | 'allowance'
    | 'transfer';
  amount?: string | number | bigint; // optional for get_cash_balance
  proof?: string; // Base64 encoded proof document
  description?: string;
}

export interface TransactionRecord {
  id: string;
  action: string;
  fromSmartAddress: string;
  toSmartAddress: string;
  fromAlias: string;
  toAlias: string;
  amount: string;
  status: 'PENDING' | 'INITIATED' | 'CONFIRMED' | 'COMPLETED' | 'FAILED';
  transactionHash?: string;
  timestamp: Date;
  proof?: string;
  description?: string;
}

export interface Entity {
  privateKey: string;
  address: string;
  smartAccount: string;
  alias: string;
  role?: string;
}

@Injectable()
export class CashTrackerService {
  private readonly logger = new Logger(CashTrackerService.name);
  private sdkConfig: SDKConfig | null = null;
  private provider: ethers.Provider | null = null;
  private entitySDKs: Map<string, CashTokenSDK> = new Map(); // smartAddress -> SDK
  private transactions: TransactionRecord[] = [];
  private signer: ethers.Signer;

  constructor(private readonly settingsService: SettingsService) {}

  /**
   * Initialize cash tracker with configuration from database
   */
  async initialize(config: CashTrackerConfig): Promise<void> {
    try {
      this.logger.log('Initializing Cash Tracker Service...');

      // Create SDK configuration
      this.sdkConfig = {
        network: {
          rpcUrl: config.network.rpcUrl,
          entryPoint: config.network.entryPoint,
        },
        contracts: {
          cashToken: config.contracts.cashToken,
          smartAccountFactory: config.contracts.smartAccountFactory,
        },
      };

      // Initialize provider
      this.provider = new ethers.JsonRpcProvider(config.network.rpcUrl);

      this.logger.log('Cash Tracker Service initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Cash Tracker Service:', error);
      throw error;
    }
  }

  /**
   * Load entities from database and create SDK instances
   */
  async loadEntities(entities: Entity[]): Promise<void> {
    try {
      this.logger.log(`Loading ${entities.length} entities...`);

      // Clear existing SDK instances
      this.entitySDKs.clear();
      // Create SDK instance for each entity
      for (const entity of entities) {
        const subGraphUrl = (
          await this.settingsService.getPublic('CASHTRACKER_SUBGRAPH_URL')
        ).value as { URL: string };
        const sdk = new CashTokenSDK(subGraphUrl.URL, {
          ...this.sdkConfig!,
          contracts: {
            ...this.sdkConfig!.contracts,
            entitySmartAccount: entity.smartAccount,
            defaultPrivatekey: entity.privateKey,
          },
        });

        await sdk.initialize();
        this.entitySDKs.set(entity.smartAccount, sdk);

        this.logger.log(
          `Loaded entity: ${entity.alias} (${entity.smartAccount})`
        );
      }

      this.logger.log('Entities loaded successfully');
    } catch (error) {
      this.logger.error('Failed to load entities:', error);
      throw error;
    }
  }

  /**
   * Serialize BigInt values to strings for JSON serialization
   */
  private serializeBigInt(obj: any): any {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj === 'bigint') {
      return obj.toString();
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.serializeBigInt(item));
    }

    if (typeof obj === 'object') {
      const serialized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        serialized[key] = this.serializeBigInt(value);
      }
      return serialized;
    }

    return obj;
  }

  /**
   * Execute action based on user story requirements
   */
  async executeAction(
    request: ExecuteActionRequest
  ): Promise<TransactionResult> {
    try {
      const { from, to, alias, action, amount } = request;

      this.logger.log(`Executing ${action} from ${from} to ${to} (${alias})`);

      // Normalize action synonyms to SDK operations
      const normalizedAction:
        | 'give_cash_allowance'
        | 'get_cash_from'
        | 'get_cash_approved_by_me'
        | 'get_cash_balance' = (() => {
        switch (action) {
          case 'initiate_transfer':
          case 'create_budget':
          case 'approve':
            return 'give_cash_allowance';
          case 'confirm_transfer':
          case 'transfer':
            return 'get_cash_from';
          case 'allowance':
          case 'get_cash_approved_by_me':
            return 'get_cash_approved_by_me';
          case 'get_cash_balance':
            return 'get_cash_balance';
          default:
            // Fallback to original if already one of the supported actions
            return action as any;
        }
      })();

      // Get SDK instance for from entity
      const fromSDK = this.entitySDKs.get(from);

      if (!fromSDK) {
        throw new Error(`Entity not found for smart address: ${from}`);
      }

      // For actions that require both from and to, ensure 'to' is provided
      if (normalizedAction !== 'get_cash_balance' && !to) {
        throw new Error(`Missing 'to' smart address for action: ${action}`);
      }

      // Validate action based on user roles (if roles are defined)
      this.validateAction(action, from, to);

      let result: TransactionResult | TokenAllowance | TokenFlowData | any;

      switch (normalizedAction) {
        case 'give_cash_allowance':
          // UNICEF Nepal CO creates budget for Field Office
          result = await fromSDK.giveCashAllowance(to!, amount!);
          return this.serializeBigInt(result);

        case 'get_cash_from':
          // Any role confirms transfer
          result = await fromSDK.getCashFrom(to!, amount);
          return this.serializeBigInt(result);

        case 'get_cash_approved_by_me':
          result = await fromSDK.getCashApprovedByMe(to!);
          return this.serializeBigInt(result as TransactionResult);

        case 'get_cash_balance':
          // For balance check, we only need the 'from' address
          const balance = await this.getBalance(from);
          return this.serializeBigInt(balance);

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return this.serializeBigInt(result as TransactionResult);
    } catch (error: any) {
      // Try to unwrap SDKError for clearer blockchain diagnostics
      const isSdkError = error?.name === 'SDKError';
      if (isSdkError) {
        this.logger.error(
          `Failed to execute action ${request.action}: ${error.message}`
        );
        if (error.details) {
          this.logger.error(`Details: ${JSON.stringify(error.details)}`);
        }
      } else {
        this.logger.error(`Failed to execute action ${request.action}:`, error);
      }
      throw error;
    }
  }

  /**
   * Validate action based on user roles
   */
  private validateAction(
    action: string,
    fromSmartAddress: string,
    toSmartAddress: string
  ): void {
    // TODO: Implement role-based validation when roles are defined in entities
    // For now, allow all actions
    switch (action) {
      case 'create_budget':
        // Add role validation when roles are implemented
        break;

      case 'initiate_transfer':
        // Add role validation when roles are implemented
        break;

      case 'confirm_transfer':
        // Any role can confirm
        break;

      default:
        // Basic actions (approve, allowance, transfer) are allowed for all roles
        break;
    }
  }

  /**
   * Get comprehensive transaction flow history
   */
  async getTransactions(): Promise<any> {
    try {
      const entities = await this.settingsService.getPublic('ENTITIES');

      // Map database entities to EntityConfig format
      const entityConfigs = (entities.value as any[]).map((entity: any) => ({
        privateKey: entity.privateKey,
        address: entity.address,
        smartAccount: entity.smartAccount,
        alias: entity.alias,
      }));
      const subGraphUrl = (
        await this.settingsService.getPublic('CASHTRACKER_SUBGRAPH_URL')
      ).value as { URL: string };

      const transactionsSdk = new CashTokenSDK(subGraphUrl.URL, {
        network: {
          rpcUrl: this.sdkConfig!.network.rpcUrl,
          entryPoint: this.sdkConfig!.network.entryPoint,
        },
        contracts: {
          cashToken: this.sdkConfig!.contracts.cashToken,
          cashtokenAbi: CashTokenAbi,
        },
        entities: entityConfigs,
      });

      // Initialize the SDK before using it
      await transactionsSdk.initialize();

      // Get comprehensive transaction flow history
      const flowHistory = await transactionsSdk.getTransactionFlowHistory(
        entityConfigs.map((entity) => ({
          smartAddress: entity.smartAccount,
          alias: entity.alias,
        }))
      );

      // Cleanup the SDK after use
      await transactionsSdk.cleanup();

      this.logger.log(
        `Retrieved flow history for ${entityConfigs.length} entities`
      );

      return flowHistory;
    } catch (error) {
      this.logger.error('Failed to get transaction flow history:', error);
      throw error;
    }
  }

  /**
   * Get entity alias by smart address
   */
  private getEntityAlias(smartAddress: string): string | null {
    // TODO: Get actual alias from database
    // For now, return a simple alias
    const aliases: { [key: string]: string } = {
      '0xE17Fa0F009d2A3EaC3C2994D7933eD759CbCe257': 'UNICEF Nepal CO',
      '0xB4b85A39C44667eDEc9F0eB5c328954e328E980B': 'UNICEF Nepal Field Office',
      '0xe5159f997F32D04F9276567bb2ED4CC0CdC9D8E4': 'Municipality',
    };

    return aliases[smartAddress] || null;
  }

  /**
   * Get balance for a smart address
   */
  async getBalance(smartAddress: string): Promise<TokenBalance | null> {
    try {
      const sdk = this.entitySDKs.get(smartAddress);

      if (!sdk) {
        this.logger.warn(`Entity not found for smart address: ${smartAddress}`);
        return null;
      }

      return await sdk.getCashBalance();
    } catch (error) {
      this.logger.error(`Failed to get balance for ${smartAddress}:`, error);
      throw error;
    }
  }

  /**
   * Get all entities
   */
  getEntities(): Entity[] {
    // TODO: Return actual entities from database
    // For now, return empty array
    return [];
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    try {
      // Cleanup all SDK instances
      for (const sdk of this.entitySDKs.values()) {
        await sdk.cleanup();
      }

      this.entitySDKs.clear();
      this.provider = null;
      this.sdkConfig = null;
      this.transactions = [];

      this.logger.log('Cash Tracker Service cleaned up');
    } catch (error) {
      this.logger.error('Failed to cleanup Cash Tracker Service:', error);
      throw error;
    }
  }

  /**
   * Create budget by minting tokens using the generic EVMUtils
   * @param mintTokenRequestDto - Mint token request parameters
   * @returns Promise<any> - Transaction receipt
   */
  async createBudget(mintTokenRequestDto: MintTokenRequestDto) {
    const { amount } = mintTokenRequestDto;

    try {
      // Get configuration from settings
      const contract = await this.settingsService.getPublic('CONTRACT');
      const cashTokenDetails = await this.settingsService.getPublic(
        'CASH_TOKEN_CONTRACT'
      );
      const cashTokenAddress = cashTokenDetails.value as string;
      const entity = await this.settingsService.getPublic('ENTITIES');
      const cashTokenReceiver = entity.value[0].smartAccount;
      const chainSettings = await this.settingsService.getPublic(
        'CHAIN_SETTINGS'
      );
      const signerPrivateKey = await this.settingsService.getPublic(
        'RAHAT_ADMIN_PRIVATE_KEY'
      );

      const rpcUrl = (chainSettings?.value as any)?.rpcUrl;
      const rahatDonor = (contract.value as any).RAHATDONOR;
      const projectAddress = (contract.value as any).AAPROJECT;
      const tokenAddress = (contract.value as any).RAHATTOKEN;

      // Initialize EVMUtils
      const evmUtils = new EVMUtils();
      const providerConfig: EVMProviderConfig = {
        rpcUrl,
        privateKey: signerPrivateKey.value as string,
      };
      await evmUtils.initialize(providerConfig);

      // Prepare mint request
      const mintRequest: MintTokenRequest = {
        tokenAddress: tokenAddress.ADDRESS,
        projectAddress: projectAddress.ADDRESS,
        amount,
        cashTokenAddress,
        cashTokenReceiver,
        decimals: 1,
      };

      // Prepare contract configuration
      const rahatDonorConfig: ContractConfig = {
        address: rahatDonor.ADDRESS,
        abi: rahatDonor.ABI,
      };

      this.logger.log(
        `Minting ${amount} tokens to project ${projectAddress}`,
        EVMProcessor.name
      );
      console.log({ mintRequest });
      // Execute mint using generic EVMUtils
      const result = await evmUtils.mintTokens(mintRequest, rahatDonorConfig);

      if (!result.success) {
        throw new RpcException(`Mint operation failed: ${result.error}`);
      }

      this.logger.log(
        `Successfully minted tokens. Transaction: ${result.transactionHash}`,
        EVMProcessor.name
      );

      return {
        transactionHash: result.transactionHash,
        blockNumber: result.blockNumber,
        gasUsed: result.gasUsed,
      };
    } catch (error) {
      this.logger.error(`Failed to create budget: ${error.message}`);
      throw new RpcException(`Budget creation failed: ${error.message}`);
    }
  }
}
