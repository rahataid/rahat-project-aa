import { ethers } from 'ethers';
import {
  SDKConfig,
  Entity,
  TokenBalance,
  TokenAllowance,
  TransactionResult,
  ValidationResult,
  SDKErrorCode,
  TokenFlowData,
  FlowHistory,
  FlowHistoryOptions,
  TransactionFlowHistory,
} from '../types';
import { ConfigManager } from './ConfigManager';
import { SDKError } from './SDKError';
import { ValidationUtils } from '../utils/ValidationUtils';
// Manager imports
import { EntityManager } from '../entities/EntityManager';
import { OperationsManager } from '../operations/OperationsManager';
import { EventManager } from '../tracking/EventManager';
import { FlowTrackingManager } from '../tracking/FlowTrackingManager';

/**
 * Main Cash Tracker SDK class
 * Each instance represents a single entity with its own smart account
 */
export class CashTokenSDK {
  private config: SDKConfig | null = null;
  private provider: ethers.Provider | null = null;
  private cashTokenContract: ethers.Contract | null = null;
  private wallet: ethers.Wallet | null = null;
  private smartAccountContract: ethers.Contract | null = null;
  private isInitialized = false;
  private entityAddress: string | null = null;
  private smartAccountAddress: string | null = null;

  // Managers
  public readonly configManager: ConfigManager;
  public readonly entities: EntityManager;
  public readonly operations: OperationsManager;
  public readonly events: EventManager;
  public readonly flowTracking: FlowTrackingManager;

  constructor(config?: SDKConfig) {
    this.configManager = new ConfigManager();
    this.entities = new EntityManager();
    this.operations = new OperationsManager();
    this.events = new EventManager();
    this.flowTracking = new FlowTrackingManager();

    if (config) {
      this.initializeWithConfig(config);
    }
  }

  /**
   * Connect wallet to the SDK
   * @param walletOrPrivateKey - Wallet instance or private key string
   */
  connect(walletOrPrivateKey: ethers.Wallet | string): void {
    if (typeof walletOrPrivateKey === 'string') {
      this.wallet = new ethers.Wallet(walletOrPrivateKey, this.provider);
    } else {
      this.wallet = walletOrPrivateKey;
    }

    this.entityAddress = this.wallet.address;

    // Set up smart account contract if smart account address is configured
    if (this.config?.contracts.entitySmartAccount && this.wallet) {
      this.smartAccountAddress = this.config.contracts.entitySmartAccount;
      this.smartAccountContract = new ethers.Contract(
        this.smartAccountAddress,
        this.getSmartAccountABI(),
        this.wallet
      );
    }
  }

  /**
   * Initialize the SDK with configuration
   * Supports three modes:
   * 1. With defaultPrivatekey - for single entity operations
   * 2. With connect() - for wallet connection
   * 3. With entities (smart addresses array) - for flow tracking
   */
  async initialize(config?: SDKConfig): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      // Load configuration
      if (config) {
        this.config = await this.configManager.loadFromObject(config);
      } else if (!this.config) {
        throw SDKError.configError(
          'No configuration provided for initialization'
        );
      }

      // Setup provider
      this.provider = new ethers.JsonRpcProvider(this.config!.network.rpcUrl);

      // Setup CashToken contract with custom ABI if provided
      const abi = this.config!.contracts.cashtokenAbi || this.getCashTokenABI();
      this.cashTokenContract = new ethers.Contract(
        this.config!.contracts.cashToken,
        abi,
        this.provider
      );

      // Auto-connect wallet if defaultPrivatekey is provided
      if (this.config!.contracts.defaultPrivatekey) {
        this.connect(this.config!.contracts.defaultPrivatekey);
      }

      // Initialize managers
      await this.entities.initialize(this.provider, this.config!);
      await this.operations.initialize(
        this.provider,
        this.cashTokenContract,
        this.config!,
        this
      );
      await this.flowTracking.initialize(
        this.provider,
        this.cashTokenContract,
        this.config!
      );

      this.isInitialized = true;

      // Emit initialization event
      this.events.emit({
        id: this.generateEventId(),
        type: 'sdk_initialized',
        timestamp: Date.now(),
      });
    } catch (error) {
      throw SDKError.fromError(error as Error, SDKErrorCode.INVALID_CONFIG);
    }
  }

  /**
   * Initialize with configuration object
   */
  private async initializeWithConfig(config: SDKConfig): Promise<void> {
    this.config = config;
    await this.initialize();
  }

  /**
   * Start flow tracking with smart addresses array
   * This is the main method for flow tracking when no private key or connect is used
   */
  async startFlowTracking(
    smartAddresses: string[],
    options?: {
      interval?: number;
      onFlowUpdate?: (flowData: TokenFlowData) => void;
    }
  ): Promise<void> {
    if (!this.isReady()) {
      throw SDKError.configError('SDK not initialized');
    }

    await this.flowTracking.startFlowTracking(smartAddresses, options);
  }

  /**
   * Stop flow tracking
   */
  async stopFlowTracking(): Promise<void> {
    await this.flowTracking.stopFlowTracking();
  }

  /**
   * Get current flow data
   */
  async getFlowData(): Promise<TokenFlowData> {
    return await this.flowTracking.getCurrentFlowData();
  }

  /**
   * Display flow status
   */
  async displayFlowStatus(): Promise<void> {
    await this.flowTracking.displayFlowStatus();
  }

  /**
   * Check if flow tracking is active
   */
  isFlowTracking(): boolean {
    return this.flowTracking.isFlowTracking();
  }

  /**
   * Get tracked addresses
   */
  getTrackedAddresses(): string[] {
    return this.flowTracking.getTrackedAddresses();
  }

  /**
   * Get complete flow history
   */
  getFlowHistory(): FlowHistory[] {
    return this.flowTracking.getFlowHistory();
  }

  /**
   * Get active flows
   */
  getActiveFlows(): FlowHistory[] {
    return this.flowTracking.getActiveFlows();
  }

  /**
   * Get flow history by ID
   */
  getFlowHistoryById(flowId: string): FlowHistory | undefined {
    return this.flowTracking.getFlowHistoryById(flowId);
  }

  /**
   * Get flow history for a specific path (A->B->C)
   */
  getFlowHistoryByPath(path: string[]): FlowHistory[] {
    return this.flowTracking.getFlowHistoryByPath(path);
  }

  /**
   * Get flow history for a specific address
   */
  getFlowHistoryByAddress(address: string): FlowHistory[] {
    return this.flowTracking.getFlowHistoryByAddress(address);
  }

  /**
   * Display complete flow history
   */
  displayFlowHistory(): void {
    this.flowTracking.displayFlowHistory();
  }

  /**
   * Display active flows
   */
  displayActiveFlows(): void {
    this.flowTracking.displayActiveFlows();
  }

  /**
   * Set flow history options
   */
  setFlowHistoryOptions(options: FlowHistoryOptions): void {
    this.flowTracking.setFlowHistoryOptions(options);
  }

  /**
   * Get all flows as JSON array by querying blockchain directly
   *
   * @param entities - Array of strings (addresses) or array of objects with smartAddress and alias
   */
  async getAllFlowsAsJSON(
    entities?: string[] | Array<{ smartAddress: string; alias: string }>
  ): Promise<any[]> {
    return this.flowTracking.getAllFlowsAsJSON(entities);
  }

  /**
   * Get flow summary by path (similar to flow diagram)
   */
  async getFlowSummaryByPath(path: string[]): Promise<any> {
    return this.flowTracking.getFlowSummaryByPath(path);
  }

  /**
   * Get all flow summaries (for all tracked paths)
   */
  async getAllFlowSummaries(): Promise<any[]> {
    return this.flowTracking.getAllFlowSummaries();
  }

  /**
   * Get comprehensive transaction flow history with steps, summary, and blockchain info
   * Perfect for frontend mapping and visualization
   */
  async getTransactionFlowHistory(
    entities?: string[] | Array<{ smartAddress: string; alias: string }>
  ): Promise<{
    entityOutcomes: Array<{
      alias: string;
      pending: Array<{
        to: string;
        amount: string;
      }>;
      balance: string;
      sent: string;
      received: string;
      flows: Array<{
        from: string;
        to: string;
        amount: string;
        transactionHash: string;
        type: 'sent' | 'received';
      }>;
    }>;
    allFlows: any[];
  }> {
    return this.flowTracking.getTransactionFlowHistory(entities);
  }

  /**
   * Get cash allowance approved to me by another address
   * @param ownerAddress - Address that approved the allowance
   */
  async getCashApprovedToMe(ownerAddress: string): Promise<TokenAllowance> {
    if (!this.isReady()) {
      throw SDKError.configError('SDK not initialized');
    }

    if (!this.smartAccountAddress) {
      throw SDKError.configError('Smart account address not set');
    }

    try {
      const allowance = await this.cashTokenContract!.allowance(
        ownerAddress,
        this.smartAccountAddress
      );
      const decimals = await this.cashTokenContract!.decimals();

      return {
        ownerId: ownerAddress,
        spenderId: this.smartAccountAddress,
        allowance,
        formatted: ethers.formatUnits(allowance, decimals),
      };
    } catch (error) {
      throw SDKError.networkError(
        `Failed to get allowance from ${ownerAddress} to ${this.smartAccountAddress}`,
        { error }
      );
    }
  }

  /**
   * Get cash allowance I approved to another address
   * @param spenderAddress - Address I approved for spending
   */
  async getCashApprovedByMe(spenderAddress: string): Promise<TokenAllowance> {
    if (!this.isReady()) {
      throw SDKError.configError('SDK not initialized');
    }

    if (!this.smartAccountAddress) {
      throw SDKError.configError('Smart account address not set');
    }

    try {
      const allowance = await this.cashTokenContract!.allowance(
        this.smartAccountAddress,
        spenderAddress
      );
      const decimals = await this.cashTokenContract!.decimals();

      return {
        ownerId: this.smartAccountAddress,
        spenderId: spenderAddress,
        allowance,
        formatted: ethers.formatUnits(allowance, decimals),
      };
    } catch (error) {
      throw SDKError.networkError(
        `Failed to get allowance from ${this.smartAccountAddress} to ${spenderAddress}`,
        { error }
      );
    }
  }

  /**
   * Get current entity's cash balance
   */
  async getCashBalance(): Promise<TokenBalance> {
    if (!this.isReady()) {
      throw SDKError.configError('SDK not initialized');
    }

    if (!this.smartAccountAddress) {
      throw SDKError.configError('Smart account address not set');
    }

    try {
      const balance = await this.cashTokenContract!.balanceOf(
        this.smartAccountAddress
      );
      const decimals = await this.cashTokenContract!.decimals();
      const symbol = await this.cashTokenContract!.symbol();

      return {
        entityId: this.smartAccountAddress,
        balance,
        formatted: ethers.formatUnits(balance, decimals),
        decimals,
        symbol,
      };
    } catch (error) {
      throw SDKError.networkError(
        `Failed to get balance for smart account ${this.smartAccountAddress}`,
        { error }
      );
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SDKConfig | null {
    return this.config;
  }

  /**
   * Check if SDK is initialized
   */
  isReady(): boolean {
    return (
      this.isInitialized &&
      this.provider !== null &&
      this.cashTokenContract !== null
    );
  }

  /**
   * Get provider instance
   */
  getProvider(): ethers.Provider | null {
    return this.provider;
  }

  /**
   * Get CashToken contract instance
   */
  getCashTokenContract(): ethers.Contract | null {
    return this.cashTokenContract;
  }

  /**
   * Get current entity address
   */
  get address(): string | null {
    return this.entityAddress;
  }

  /**
   * Get current smart account address
   */
  get smartAccount(): string | null {
    return this.smartAccountAddress;
  }

  /**
   * Get CashToken ABI
   */
  private getCashTokenABI(): any {
    // Try to load from artifacts directory first
    try {
      const path = require('path');
      const fs = require('fs');

      const artifactPath = path.join(
        __dirname,
        '../artifacts/CashTokenAbi.json'
      );
      if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        return artifact;
      }
    } catch (error) {
      console.warn('Could not load CashTokenAbi.json, using fallback ABI');
    }

    // Fallback to minimal ABI
    return [
      'function balanceOf(address account) view returns (uint256)',
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
      'function transfer(address to, uint256 amount) returns (bool)',
      'function transferFrom(address from, address to, uint256 amount) returns (bool)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function name() view returns (string)',
      'function totalSupply() view returns (uint256)',
      'function mint(address to, uint256 amount)',
      'function burn(address from, uint256 amount)',
    ];
  }

  /**
   * Get Smart Account ABI
   */
  private getSmartAccountABI(): any {
    // Try to load from artifacts directory first
    try {
      const path = require('path');
      const fs = require('fs');

      const artifactPath = path.join(
        __dirname,
        '../artifacts/SmartAccountAbi.json'
      );
      if (fs.existsSync(artifactPath)) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        return artifact;
      }
    } catch (error) {
      console.warn('Could not load SmartAccountAbi.json, using fallback ABI');
    }

    // Fallback to minimal ABI
    return [
      'function execute(address dest, uint256 value, bytes calldata functionData) external',
      'function getEntryPoint() external view returns (address)',
      'function owner() external view returns (address)',
    ];
  }

  /**
   * Parse units with proper decimal handling
   */
  private parseUnits(amount: string | number, decimals: number): bigint {
    if (typeof amount === 'string') {
      return ethers.parseUnits(amount, decimals);
    }
    // If amount is a number, assume it's already in the smallest unit
    return BigInt(amount);
  }

  /**
   * Format units with proper decimal handling
   */
  private formatUnits(amount: bigint, decimals: number): string {
    return ethers.formatUnits(amount, decimals);
  }

  /**
   * Check if entity has sufficient balance for approval
   */
  private async checkBalanceForApproval(amount: bigint): Promise<void> {
    if (!this.smartAccountAddress) {
      throw SDKError.configError('Smart account address not set');
    }

    const balance = await this.cashTokenContract!.balanceOf(
      this.smartAccountAddress
    );

    if (balance < amount) {
      const decimals = await this.cashTokenContract!.decimals();
      const symbol = await this.cashTokenContract!.symbol();

      throw SDKError.validationError(
        `Insufficient balance for approval. Required: ${this.formatUnits(
          amount,
          decimals
        )} ${symbol}, Available: ${this.formatUnits(
          balance,
          decimals
        )} ${symbol}`
      );
    }
  }

  /**
   * Give cash allowance to another address
   * @param spenderAddress - Address to approve for spending
   * @param amount - Amount to approve (can be string or number)
   */
  async giveCashAllowance(
    spenderAddress: string,
    amount: string | number | bigint
  ): Promise<TransactionResult> {
    if (!this.isReady()) {
      throw SDKError.configError('SDK not initialized');
    }

    if (!this.wallet || !this.smartAccountContract) {
      throw SDKError.configError(
        'Wallet not connected or smart account not configured'
      );
    }

    try {
      // Get decimals for proper parsing
      const decimals = await this.cashTokenContract!.decimals();
      const symbol = await this.cashTokenContract!.symbol();

      // Parse amount to bigint
      let amountBigInt: bigint;
      if (typeof amount === 'bigint') {
        amountBigInt = amount;
      } else {
        amountBigInt = this.parseUnits(amount.toString(), decimals);
      }

      // Check if entity has sufficient balance for approval
      await this.checkBalanceForApproval(amountBigInt);

      console.log(
        `Approving ${this.formatUnits(
          amountBigInt,
          decimals
        )} ${symbol} for: ${spenderAddress}`
      );

      // Encode approval data
      const approveData = this.cashTokenContract!.interface.encodeFunctionData(
        'approve',
        [spenderAddress, amountBigInt]
      );

      // Execute through smart account
      const approveTx = await this.smartAccountContract.execute(
        this.cashTokenContract!.target,
        0,
        approveData
      );

      const receipt = await approveTx.wait();

      return {
        hash: approveTx.hash,
        status: 'confirmed',
        receipt,
        gasUsed: receipt?.gasUsed,
        gasPrice: receipt?.gasPrice,
      };
    } catch (error) {
      throw SDKError.transactionFailed(
        `Failed to approve tokens for ${spenderAddress}`,
        { error }
      );
    }
  }

  /**
   * Get cash from another address (transferFrom)
   * @param fromAddress - Address to transfer from
   * @param amount - Amount to transfer (can be string, number, or bigint, optional - will use full allowance if not specified)
   */
  async getCashFrom(
    fromAddress: string,
    amount?: string | number | bigint
  ): Promise<TransactionResult> {
    if (!this.isReady()) {
      throw SDKError.configError('SDK not initialized');
    }

    if (!this.wallet || !this.smartAccountContract) {
      throw SDKError.configError(
        'Wallet not connected or smart account not configured'
      );
    }

    if (!this.smartAccountAddress) {
      throw SDKError.configError('Smart account address not set');
    }

    try {
      const decimals = await this.cashTokenContract!.decimals();
      const symbol = await this.cashTokenContract!.symbol();

      // If amount not specified, use full allowance
      let amountBigInt: bigint;
      if (!amount) {
        const allowance = await this.cashTokenContract!.allowance(
          fromAddress,
          this.smartAccountAddress
        );
        amountBigInt = allowance;
      } else {
        // Parse amount to bigint
        if (typeof amount === 'bigint') {
          amountBigInt = amount;
        } else {
          amountBigInt = this.parseUnits(amount.toString(), decimals);
        }
      }

      // Check if there's sufficient allowance
      const allowance = await this.cashTokenContract!.allowance(
        fromAddress,
        this.smartAccountAddress
      );

      if (allowance < amountBigInt) {
        throw SDKError.validationError(
          `Insufficient allowance. Required: ${this.formatUnits(
            amountBigInt,
            decimals
          )} ${symbol}, Available: ${this.formatUnits(
            allowance,
            decimals
          )} ${symbol}`
        );
      }

      console.log(
        `Transferring ${this.formatUnits(
          amountBigInt,
          decimals
        )} ${symbol} from ${fromAddress} to ${this.smartAccountAddress}`
      );

      // Encode transferFrom data
      const transferFromData =
        this.cashTokenContract!.interface.encodeFunctionData('transferFrom', [
          fromAddress,
          this.smartAccountAddress,
          amountBigInt,
        ]);

      // Execute through smart account
      const transferTx = await this.smartAccountContract.execute(
        this.cashTokenContract!.target,
        0,
        transferFromData
      );

      const receipt = await transferTx.wait();

      return {
        hash: transferTx.hash,
        status: 'confirmed',
        receipt,
        gasUsed: receipt?.gasUsed,
        gasPrice: receipt?.gasPrice,
      };
    } catch (error) {
      throw SDKError.transactionFailed(
        `Failed to transfer tokens from ${fromAddress}`,
        { error }
      );
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.isInitialized = false;
    this.provider = null;
    this.cashTokenContract = null;
    this.wallet = null;
    this.smartAccountContract = null;
    this.entityAddress = null;
    this.smartAccountAddress = null;

    // Stop tracking sessions
    // await this.tracking.stopAllSessions(); // This line is removed

    // Clear event subscriptions
    this.events.clearSubscriptions();
  }

  // Legacy methods for backward compatibility
  async getBalance(entityId: string): Promise<TokenBalance> {
    return this.getCashBalance();
  }

  async approveTokens(
    ownerId: string,
    spenderId: string,
    amount: bigint
  ): Promise<TransactionResult> {
    return this.giveCashAllowance(spenderId, amount);
  }

  async getAllowance(
    ownerId: string,
    spenderId: string
  ): Promise<TokenAllowance> {
    return this.getCashApprovedByMe(spenderId);
  }

  async transferFrom(
    spenderId: string,
    fromId: string,
    toId: string,
    amount: bigint
  ): Promise<TransactionResult> {
    return this.getCashFrom(fromId, amount);
  }
}
