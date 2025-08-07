import { Injectable, Logger } from '@nestjs/common';
import {
  CashTokenSDK,
  SDKConfig,
  TokenBalance,
  TokenAllowance,
  TransactionResult,
  EntityConfig,
  TokenFlowData,
} from '@rahataid/cash-tracker';
import { ethers } from 'ethers';
import { SettingsService } from '@rumsan/settings';

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
  to: string; // smart address
  alias: string;
  action:
    | 'create_budget'
    | 'initiate_transfer'
    | 'confirm_transfer'
    | 'approve'
    | 'allowance'
    | 'transfer';
  amount: string | number | bigint;
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
  private settingsService: SettingsService;
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
        const sdk = new CashTokenSDK({
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
   * Execute action based on user story requirements
   */
  async executeAction(
    request: ExecuteActionRequest
  ): Promise<TransactionResult> {
    try {
      const { from, to, alias, action, amount } = request;

      this.logger.log(`Executing ${action} from ${from} to ${to} (${alias})`);

      // Get SDK instances for from and to entities
      const fromSDK = this.entitySDKs.get(from);
      const toSDK = this.entitySDKs.get(to);

      if (!fromSDK) {
        throw new Error(`Entity not found for smart address: ${from}`);
      }

      if (!toSDK) {
        throw new Error(`Entity not found for smart address: ${to}`);
      }

      // Validate action based on user roles (if roles are defined)
      this.validateAction(action, from, to);

      let result: TransactionResult | TokenAllowance | TokenFlowData | any;
      let allowanceResult: TokenAllowance;

      switch (action) {
        case 'create_budget':
          // UNICEF Nepal CO creates budget for Field Office
          result = await fromSDK.giveCashAllowance(to, amount);
          return result;

        case 'initiate_transfer':
          // UNICEF Nepal CO or Field Office initiates transfer
          result = await fromSDK.giveCashAllowance(to, amount);
          return result;

        case 'confirm_transfer':
          // Any role confirms transfer
          result = await fromSDK.getCashFrom(to, amount);
          return result;

        case 'approve':
          result = await fromSDK.giveCashAllowance(to, amount);
          return result;

        case 'allowance':
          result = await fromSDK.getCashApprovedByMe(to);
          return result as TransactionResult;

        case 'transfer':
          result = await fromSDK.getCashFrom(to, amount);
          return result as TransactionResult;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return result as TransactionResult;
    } catch (error) {
      this.logger.error(`Failed to execute action ${request.action}:`, error);
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
      const transactionsSdk = new CashTokenSDK({
        ...this.sdkConfig!,
        contracts: {
          ...this.sdkConfig!.contracts,
        },
        entities: entities.value as unknown as EntityConfig[],
      });

      // Get comprehensive transaction flow history
      const flowHistory = await transactionsSdk.getTransactionFlowHistory();

      // this.logger.log(
      //   `Retrieved flow history for ${entities.value.length} entities`
      // );

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
}
