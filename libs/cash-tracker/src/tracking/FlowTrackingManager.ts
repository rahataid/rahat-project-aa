import { ethers } from 'ethers';
import {
  SDKConfig,
  FlowTrackingConfig,
  TokenFlowData,
  TokenFlow,
  TokenBalance,
  TokenAllowance,
  FlowHistory,
  FlowHistoryEntry,
  FlowHistoryOptions,
  TransactionFlowHistory,
  EntityOutcome,
  ApprovalEvent,
  TransactionFlowPath,
  TransactionFlowStep,
  TransactionFlow,
} from '../types';
import { SDKError } from '../core/SDKError';
import { EventManager } from './EventManager';
import { FlowTrackingEvent } from '../types/events';

/**
 * Flow Tracking Manager for monitoring token flow between smart addresses
 */
export class FlowTrackingManager {
  private provider: ethers.Provider | null = null;
  private cashTokenContract: ethers.Contract | null = null;
  private config: SDKConfig | null = null;
  private flowConfig: FlowTrackingConfig | null = null;
  private isTracking = false;
  private trackingInterval: NodeJS.Timeout | null = null;
  private eventManager: EventManager;
  private previousBalances: Map<string, bigint> = new Map();
  private previousAllowances: Map<string, Map<string, bigint>> = new Map();

  // Flow history tracking
  private flowHistories: Map<string, FlowHistory> = new Map();
  private activeFlows: Map<string, FlowHistory> = new Map();
  private flowHistoryOptions: FlowHistoryOptions = {
    maxHistory: 100,
    includeBlockNumbers: true,
    includeDescriptions: true,
  };

  constructor() {
    this.eventManager = new EventManager();
  }

  /**
   * Initialize the flow tracking manager
   */
  async initialize(
    provider: ethers.Provider,
    cashTokenContract: ethers.Contract,
    config: SDKConfig
  ): Promise<void> {
    this.provider = provider;
    this.cashTokenContract = cashTokenContract;
    this.config = config;
    this.flowConfig = config.flowTracking || null;
  }

  /**
   * Set flow history options
   */
  setFlowHistoryOptions(options: FlowHistoryOptions): void {
    this.flowHistoryOptions = { ...this.flowHistoryOptions, ...options };
  }

  /**
   * Get complete flow history
   */
  getFlowHistory(): FlowHistory[] {
    return Array.from(this.flowHistories.values()).sort(
      (a, b) => b.startTime - a.startTime
    );
  }

  /**
   * Get active flows
   */
  getActiveFlows(): FlowHistory[] {
    return Array.from(this.activeFlows.values());
  }

  /**
   * Get flow history by ID
   */
  getFlowHistoryById(flowId: string): FlowHistory | undefined {
    return this.flowHistories.get(flowId);
  }

  /**
   * Get flow history for a specific path (A->B->C)
   */
  getFlowHistoryByPath(path: string[]): FlowHistory[] {
    const pathKey = path.join('->');
    return Array.from(this.flowHistories.values()).filter(
      (flow) => flow.path.join('->') === pathKey
    );
  }

  /**
   * Get flow history for a specific address
   */
  getFlowHistoryByAddress(address: string): FlowHistory[] {
    return Array.from(this.flowHistories.values()).filter((flow) =>
      flow.path.includes(address)
    );
  }

  /**
   * Display complete flow history
   */
  displayFlowHistory(): void {
    console.log('\n=== Complete Flow History ===');

    const histories = this.getFlowHistory();
    if (histories.length === 0) {
      console.log('No flow history found.');
      return;
    }

    for (const history of histories) {
      console.log(`\n📊 Flow ID: ${history.flowId}`);
      console.log(`   Path: ${history.path.join(' -> ')}`);
      console.log(`   Total Amount: ${history.formattedTotalAmount} CASH`);
      console.log(`   Status: ${history.status}`);
      console.log(`   Start: ${new Date(history.startTime).toLocaleString()}`);
      if (history.endTime) {
        console.log(`   End: ${new Date(history.endTime).toLocaleString()}`);
      }
      console.log(
        `   Duration: ${this.formatDuration(
          history.startTime,
          history.endTime || Date.now()
        )}`
      );

      if (history.description) {
        console.log(`   Description: ${history.description}`);
      }

      console.log('   Steps:');
      for (const entry of history.entries) {
        const direction = entry.type === 'balance_change' ? '↔' : '→';
        const time = new Date(entry.timestamp).toLocaleTimeString();
        console.log(
          `     ${entry.step}. ${entry.from} ${direction} ${entry.to}: ${entry.formatted} CASH (${entry.type}) - ${time}`
        );
        if (entry.transactionHash) {
          console.log(`        TX: ${entry.transactionHash}`);
        }
      }
      console.log('─'.repeat(50));
    }
  }

  /**
   * Display active flows
   */
  displayActiveFlows(): void {
    console.log('\n=== Active Flows ===');

    const activeFlows = this.getActiveFlows();
    if (activeFlows.length === 0) {
      console.log('No active flows found.');
      return;
    }

    for (const flow of activeFlows) {
      console.log(`\n🔄 Active Flow ID: ${flow.flowId}`);
      console.log(`   Path: ${flow.path.join(' -> ')}`);
      console.log(`   Current Amount: ${flow.formattedTotalAmount} CASH`);
      console.log(`   Start: ${new Date(flow.startTime).toLocaleString()}`);
      console.log(
        `   Duration: ${this.formatDuration(flow.startTime, Date.now())}`
      );

      console.log('   Steps:');
      for (const entry of flow.entries) {
        const direction = entry.type === 'balance_change' ? '↔' : '→';
        const time = new Date(entry.timestamp).toLocaleTimeString();
        console.log(
          `     ${entry.step}. ${entry.from} ${direction} ${entry.to}: ${entry.formatted} CASH (${entry.type}) - ${time}`
        );
      }
      console.log('─'.repeat(50));
    }
  }

  /**
   * Start flow tracking with smart addresses array
   */
  async startFlowTracking(
    smartAddresses: string[],
    options?: {
      interval?: number;
      onFlowUpdate?: (flowData: TokenFlowData) => void;
    }
  ): Promise<void> {
    if (!this.cashTokenContract) {
      throw SDKError.configError('Flow tracking manager not initialized');
    }

    if (smartAddresses.length < 2) {
      throw SDKError.validationError(
        'Need at least 2 smart addresses for flow tracking'
      );
    }

    // Stop existing tracking if running
    if (this.isTracking) {
      await this.stopFlowTracking();
    }

    this.flowConfig = {
      smartAddresses,
      interval: options?.interval || 5000,
      onFlowUpdate: options?.onFlowUpdate,
    };

    this.isTracking = true;

    // Initialize previous state
    await this.initializePreviousState();

    // Start tracking loop
    const trackFlow = async () => {
      if (!this.isTracking) return;

      try {
        const flowData = await this.getCurrentFlowData();

        // Process flow history
        await this.processFlowHistory(flowData);

        // Emit flow update event
        const flowUpdateEvent: FlowTrackingEvent = {
          id: this.generateEventId(),
          type: 'flow_update',
          timestamp: Date.now(),
          data: flowData,
        };
        this.eventManager.emit(flowUpdateEvent);

        // Call onFlowUpdate callback if provided
        if (this.flowConfig?.onFlowUpdate) {
          this.flowConfig.onFlowUpdate(flowData);
        }

        // Update previous state
        this.updatePreviousState(flowData);
      } catch (error) {
        console.error('Flow tracking error:', error);
        const flowErrorEvent: FlowTrackingEvent = {
          id: this.generateEventId(),
          type: 'flow_tracking_error',
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : String(error),
        };
        this.eventManager.emit(flowErrorEvent);
      }
    };

    // Initial tracking
    await trackFlow();

    // Set up interval
    this.trackingInterval = setInterval(trackFlow, this.flowConfig.interval);

    // Emit tracking started event
    const flowStartedEvent: FlowTrackingEvent = {
      id: this.generateEventId(),
      type: 'flow_tracking_started',
      timestamp: Date.now(),
      smartAddresses,
    };
    this.eventManager.emit(flowStartedEvent);

    console.log(
      `🚀 Flow tracking started for ${smartAddresses.length} smart addresses`
    );
  }

  /**
   * Stop flow tracking
   */
  async stopFlowTracking(): Promise<void> {
    this.isTracking = false;

    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    // Clear previous state
    this.previousBalances.clear();
    this.previousAllowances.clear();

    // Emit tracking stopped event
    this.eventManager.emit({
      id: this.generateEventId(),
      type: 'flow_tracking_stopped',
      timestamp: Date.now(),
    });

    console.log('🛑 Flow tracking stopped');
  }

  /**
   * Get current flow data
   */
  async getCurrentFlowData(): Promise<TokenFlowData> {
    if (!this.cashTokenContract || !this.flowConfig) {
      throw SDKError.configError('Flow tracking not initialized');
    }

    const flows: TokenFlow[] = [];
    const balances: TokenBalance[] = [];
    const allowances: TokenAllowance[] = [];

    try {
      // Get current balances and allowances
      for (const address of this.flowConfig.smartAddresses) {
        // Get balance
        const balance = await this.cashTokenContract.balanceOf(address);
        const decimals = await this.cashTokenContract.decimals();
        const symbol = await this.cashTokenContract.symbol();

        balances.push({
          entityId: address,
          balance,
          formatted: ethers.formatUnits(balance, decimals),
          decimals,
          symbol,
        });

        // Check for balance changes
        const previousBalance = this.previousBalances.get(address);
        if (previousBalance !== undefined && balance !== previousBalance) {
          const change = balance - previousBalance;
          flows.push({
            from: change > 0n ? 'external' : address,
            to: change > 0n ? address : 'external',
            amount: change > 0n ? change : -change,
            formatted: ethers.formatUnits(
              change > 0n ? change : -change,
              decimals
            ),
            timestamp: Date.now(),
            type: 'balance_change',
          });
        }

        // Get allowances
        for (const spenderAddress of this.flowConfig.smartAddresses) {
          if (address !== spenderAddress) {
            const allowance = await this.cashTokenContract.allowance(
              address,
              spenderAddress
            );

            allowances.push({
              ownerId: address,
              spenderId: spenderAddress,
              allowance,
              formatted: ethers.formatUnits(allowance, decimals),
            });

            // Check for allowance changes
            const previousAllowance = this.previousAllowances
              .get(address)
              ?.get(spenderAddress);
            if (
              previousAllowance !== undefined &&
              allowance !== previousAllowance
            ) {
              const change = allowance - previousAllowance;
              flows.push({
                from: address,
                to: spenderAddress,
                amount: change > 0n ? change : -change,
                formatted: ethers.formatUnits(
                  change > 0n ? change : -change,
                  decimals
                ),
                timestamp: Date.now(),
                type: 'allowance',
              });
            }
          }
        }
      }

      return {
        timestamp: Date.now(),
        flows,
        balances,
        allowances,
      };
    } catch (error) {
      throw SDKError.trackingError('Failed to get current flow data', {
        error,
      });
    }
  }

  /**
   * Display current flow status
   */
  async displayFlowStatus(): Promise<void> {
    if (!this.cashTokenContract || !this.flowConfig) {
      throw SDKError.configError('Flow tracking not initialized');
    }

    this.clearConsole();
    console.log('\n=== CashToken Flow Tracker ===');
    console.log(
      `Tracking ${this.flowConfig.smartAddresses.length} smart addresses`
    );
    console.log('Press Ctrl+C to stop tracking\n');

    const flowData = await this.getCurrentFlowData();

    // Display balances
    console.log('=== Token Balances ===');
    for (const balance of flowData.balances) {
      console.log(
        `${balance.entityId}: ${balance.formatted} ${balance.symbol}`
      );
    }

    // Display allowances
    console.log('\n=== Token Allowances ===');
    for (const allowance of flowData.allowances) {
      if (allowance.allowance > 0n) {
        console.log(
          `${allowance.ownerId} → ${allowance.spenderId}: ${allowance.formatted} CASH`
        );
      }
    }

    // Display recent flows
    if (flowData.flows.length > 0) {
      console.log('\n=== Recent Flows ===');
      for (const flow of flowData.flows.slice(-5)) {
        // Show last 5 flows
        const direction = flow.type === 'balance_change' ? '↔' : '→';
        console.log(
          `${flow.from} ${direction} ${flow.to}: ${flow.formatted} CASH (${flow.type})`
        );
      }
    }
  }

  /**
   * Initialize previous state for change detection
   */
  private async initializePreviousState(): Promise<void> {
    if (!this.cashTokenContract || !this.flowConfig) return;

    for (const address of this.flowConfig.smartAddresses) {
      // Initialize balances
      const balance = await this.cashTokenContract.balanceOf(address);
      this.previousBalances.set(address, balance);

      // Initialize allowances
      this.previousAllowances.set(address, new Map());
      for (const spenderAddress of this.flowConfig.smartAddresses) {
        if (address !== spenderAddress) {
          const allowance = await this.cashTokenContract.allowance(
            address,
            spenderAddress
          );
          this.previousAllowances.get(address)!.set(spenderAddress, allowance);
        }
      }
    }
  }

  /**
   * Update previous state with current data
   */
  private updatePreviousState(flowData: TokenFlowData): void {
    // Update balances
    for (const balance of flowData.balances) {
      this.previousBalances.set(balance.entityId, balance.balance);
    }

    // Update allowances
    for (const allowance of flowData.allowances) {
      if (!this.previousAllowances.has(allowance.ownerId)) {
        this.previousAllowances.set(allowance.ownerId, new Map());
      }
      this.previousAllowances
        .get(allowance.ownerId)!
        .set(allowance.spenderId, allowance.allowance);
    }
  }

  /**
   * Process flow history from current flow data
   */
  private async processFlowHistory(flowData: TokenFlowData): Promise<void> {
    for (const flow of flowData.flows) {
      // Check if this flow is part of an existing active flow
      let foundActiveFlow = false;

      for (const [flowId, activeFlow] of this.activeFlows) {
        if (this.isFlowPartOfPath(flow, activeFlow.path)) {
          // Add to existing active flow
          const entry: FlowHistoryEntry = {
            step: activeFlow.entries.length + 1,
            from: flow.from,
            to: flow.to,
            amount: flow.amount,
            formatted: flow.formatted,
            transactionHash: flow.transactionHash,
            timestamp: flow.timestamp,
            type: flow.type,
            blockNumber: this.flowHistoryOptions.includeBlockNumbers
              ? await this.getCurrentBlockNumber()
              : undefined,
          };

          activeFlow.entries.push(entry);
          activeFlow.totalAmount += flow.amount;
          activeFlow.formattedTotalAmount = this.formatAmount(
            activeFlow.totalAmount
          );

          // Check if flow is complete (reached the end of the path)
          if (this.isFlowComplete(activeFlow)) {
            activeFlow.status = 'completed';
            activeFlow.endTime = Date.now();
            this.activeFlows.delete(flowId);
            this.flowHistories.set(flowId, activeFlow);
          }

          foundActiveFlow = true;
          break;
        }
      }

      // If not part of existing flow, check if it starts a new flow
      if (!foundActiveFlow) {
        const newFlow = this.detectNewFlow(flow, flowData);
        if (newFlow) {
          this.activeFlows.set(newFlow.flowId, newFlow);
        }
      }
    }

    // Clean up old histories if max limit reached
    this.cleanupOldHistories();
  }

  /**
   * Detect if a flow starts a new flow path
   */
  private detectNewFlow(
    flow: TokenFlow,
    flowData: TokenFlowData
  ): FlowHistory | null {
    if (!this.flowConfig) return null;

    const smartAddresses = this.flowConfig.smartAddresses;

    // Check if this flow starts a new path (from first address)
    if (flow.from === smartAddresses[0] && flow.type === 'allowance') {
      // Look for potential path continuation
      const potentialPath = this.findPotentialPath(flow.to, smartAddresses);
      if (potentialPath.length > 2) {
        // At least A->B->C
        const flowId = this.generateFlowId();
        const entry: FlowHistoryEntry = {
          step: 1,
          from: flow.from,
          to: flow.to,
          amount: flow.amount,
          formatted: flow.formatted,
          transactionHash: flow.transactionHash,
          timestamp: flow.timestamp,
          type: flow.type,
          blockNumber: this.flowHistoryOptions.includeBlockNumbers
            ? undefined
            : undefined, // Will be set in next update
        };

        return {
          flowId,
          startTime: flow.timestamp,
          path: potentialPath,
          entries: [entry],
          totalAmount: flow.amount,
          formattedTotalAmount: flow.formatted,
          status: 'active',
          description: this.flowHistoryOptions.includeDescriptions
            ? `Flow from ${flow.from} to ${
                potentialPath[potentialPath.length - 1]
              }`
            : undefined,
        };
      }
    }

    return null;
  }

  /**
   * Find potential flow path starting from an address
   */
  private findPotentialPath(
    startAddress: string,
    smartAddresses: string[]
  ): string[] {
    const path = [startAddress];
    let currentAddress = startAddress;

    // Find next address in the flow
    for (let i = 0; i < smartAddresses.length - 1; i++) {
      const currentIndex = smartAddresses.indexOf(currentAddress);
      if (currentIndex !== -1 && currentIndex < smartAddresses.length - 1) {
        const nextAddress = smartAddresses[currentIndex + 1];
        path.push(nextAddress);
        currentAddress = nextAddress;
      } else {
        break;
      }
    }

    return path;
  }

  /**
   * Check if a flow is part of a path
   */
  private isFlowPartOfPath(flow: TokenFlow, path: string[]): boolean {
    for (let i = 0; i < path.length - 1; i++) {
      if (flow.from === path[i] && flow.to === path[i + 1]) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a flow is complete (reached the end of the path)
   */
  private isFlowComplete(flow: FlowHistory): boolean {
    const lastEntry = flow.entries[flow.entries.length - 1];
    const lastPathAddress = flow.path[flow.path.length - 1];

    return lastEntry.to === lastPathAddress;
  }

  /**
   * Clean up old flow histories
   */
  private cleanupOldHistories(): void {
    if (
      this.flowHistoryOptions.maxHistory &&
      this.flowHistories.size > this.flowHistoryOptions.maxHistory
    ) {
      const histories = Array.from(this.flowHistories.entries()).sort(
        (a, b) => b[1].startTime - a[1].startTime
      );

      const toRemove = histories.slice(this.flowHistoryOptions.maxHistory);
      for (const [flowId] of toRemove) {
        this.flowHistories.delete(flowId);
      }
    }
  }

  /**
   * Get current block number
   */
  private async getCurrentBlockNumber(): Promise<number | undefined> {
    try {
      return await this.provider?.getBlockNumber();
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Format amount with decimals
   */
  private formatAmount(amount: bigint): string {
    // This would need to be implemented with proper decimal handling
    return amount.toString();
  }

  /**
   * Format duration
   */
  private formatDuration(startTime: number, endTime: number): string {
    const duration = endTime - startTime;
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Generate unique flow ID
   */
  private generateFlowId(): string {
    return `flow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get flow tracking status
   */
  isFlowTracking(): boolean {
    return this.isTracking;
  }

  /**
   * Get tracked smart addresses
   */
  getTrackedAddresses(): string[] {
    return this.flowConfig?.smartAddresses || [];
  }

  /**
   * Subscribe to flow events
   */
  on(event: string, callback: (event: FlowTrackingEvent) => void): void {
    this.eventManager.subscribe(event, callback);
  }

  /**
   * Unsubscribe from flow events
   */
  off(event: string): void {
    this.eventManager.unsubscribe(event);
  }

  /**
   * Clear console (platform-specific)
   */
  private clearConsole(): void {
    console.clear();
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `flow_event_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
  }

  /**
   * Get all flows as JSON by querying blockchain directly
   * This queries actual transactions from the blockchain
   *
   * @param entities - Array of strings (addresses) or array of objects with smartAddress and alias
   */
  async getAllFlowsAsJSON(
    entities?: string[] | Array<{ smartAddress: string; alias: string }>
  ): Promise<any[]> {
    if (!this.cashTokenContract || !this.provider) {
      throw new Error('SDK not properly initialized');
    }

    const allFlows: any[] = [];

    // Determine tracked addresses and create alias mapping
    let trackedAddresses: string[];
    const aliasMap = new Map<string, string>();

    if (entities) {
      if (typeof entities[0] === 'string') {
        // Array of strings (addresses)
        trackedAddresses = entities as string[];
        // Use addresses as aliases
        trackedAddresses.forEach((addr) => aliasMap.set(addr, addr));
      } else {
        // Array of objects with smartAddress and alias
        const entityObjects = entities as Array<{
          smartAddress: string;
          alias: string;
        }>;
        trackedAddresses = entityObjects.map((obj) => obj.smartAddress);
        entityObjects.forEach((obj) =>
          aliasMap.set(obj.smartAddress, obj.alias)
        );
      }
    } else {
      // Check if entities are configured in the SDK config
      if (this.config?.entities) {
        // Convert EntityConfig[] to the format we need
        const entityObjects = this.config.entities.map((entity, index) => ({
          smartAddress: entity.smartAccount,
          alias: entity.alias || `Entity_${String.fromCharCode(65 + index)}`, // Use provided alias or generate default
        }));
        trackedAddresses = entityObjects.map((obj) => obj.smartAddress);
        entityObjects.forEach((obj) =>
          aliasMap.set(obj.smartAddress, obj.alias)
        );
      } else {
        // Use existing tracked addresses from flow tracking
        trackedAddresses = this.getTrackedAddresses();
        trackedAddresses.forEach((addr) => aliasMap.set(addr, addr));
      }
    }

    if (trackedAddresses.length < 2) {
      return allFlows;
    }

    try {
      // Get current block number
      const currentBlock = await this.provider.getBlockNumber();
      const fromBlock = Math.max(0, currentBlock - 10000); // Last 10k blocks

      // Get all Transfer events
      const transferFilter = this.cashTokenContract.filters.Transfer();
      const transferEvents = await this.cashTokenContract.queryFilter(
        transferFilter,
        fromBlock,
        currentBlock
      );

      // Process transfers to build flows
      const flows = this.processTransferEvents(
        transferEvents,
        trackedAddresses
      );

      // Group flows by path
      const trackedAddressesChecksum = trackedAddresses.map((addr) =>
        ethers.getAddress(addr)
      );
      const groupedFlows = this.groupFlowsByPath(
        flows,
        trackedAddressesChecksum
      );

      // Convert to JSON format
      for (const [pathKey, pathFlows] of groupedFlows.entries()) {
        const path = pathKey.split('->');
        const totalAmount = pathFlows.reduce(
          (sum: number, flow: any) => sum + flow.amount,
          0
        );

        // Calculate entity totals
        const entityTotals = this.calculateEntityTotals(pathFlows, path);

        allFlows.push({
          path: path,
          pathAliases: path.map((addr) => aliasMap.get(addr) || addr),
          totalFlows: pathFlows.length,
          totalAmount: this.formatAmount(totalAmount),
          entityTotals: entityTotals,
          entityTotalsWithAliases: Object.fromEntries(
            Object.entries(entityTotals).map(([addr, totals]) => [
              aliasMap.get(addr) || addr,
              totals,
            ])
          ),
          flows: pathFlows.map((flow: any) => ({
            from: flow.from,
            fromAlias: aliasMap.get(flow.from) || flow.from,
            to: flow.to,
            toAlias: aliasMap.get(flow.to) || flow.to,
            amount: this.formatAmount(flow.amount),
            type: flow.type,
            transactionHash: flow.transactionHash,
            blockNumber: flow.blockNumber,
            timestamp: flow.timestamp,
          })),
        });
      }

      return allFlows;
    } catch (error) {
      console.error('Error querying blockchain for flows:', error);
      return [];
    }
  }

  /**
   * Process transfer events to extract flows
   */
  private processTransferEvents(
    transferEvents: any[],
    trackedAddresses: string[]
  ): any[] {
    const flows: any[] = [];
    const trackedAddressesChecksum = trackedAddresses.map((addr) =>
      ethers.getAddress(addr)
    );

    // Process transfer events
    for (const event of transferEvents) {
      if ('args' in event) {
        const { from, to, value } = event.args;
        const fromAddr = ethers.getAddress(from);
        const toAddr = ethers.getAddress(to);
        const amount = Number(value) / Math.pow(10, 18); // Convert from wei

        if (
          trackedAddressesChecksum.includes(fromAddr) ||
          trackedAddressesChecksum.includes(toAddr)
        ) {
          flows.push({
            from: fromAddr,
            to: toAddr,
            amount: amount,
            type: 'transfer',
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber,
            timestamp: Date.now(), // We'll get actual timestamp later if needed
          });
        }
      }
    }

    return flows;
  }

  /**
   * Group flows by their path (sequence of entities)
   */
  private groupFlowsByPath(
    flows: any[],
    trackedAddresses: string[]
  ): Map<string, any[]> {
    const groupedFlows = new Map<string, any[]>();

    // Find all possible paths through tracked addresses
    const paths = this.generateAllPaths(trackedAddresses);

    for (const path of paths) {
      const pathKey = path.join('->');
      const pathFlows: any[] = [];

      // Find flows that follow this path
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];

        const matchingFlows = flows.filter(
          (flow) => flow.from === from && flow.to === to
        );

        pathFlows.push(...matchingFlows);
      }

      if (pathFlows.length > 0) {
        groupedFlows.set(pathKey, pathFlows);
      }
    }

    return groupedFlows;
  }

  /**
   * Generate all possible paths through tracked addresses
   */
  private generateAllPaths(addresses: string[]): string[][] {
    const paths: string[][] = [];

    // Generate paths of different lengths
    for (let length = 2; length <= addresses.length; length++) {
      for (let start = 0; start <= addresses.length - length; start++) {
        const path = addresses.slice(start, start + length);
        paths.push(path);
      }
    }

    return paths;
  }

  /**
   * Calculate totals for each entity in a flow
   */
  private calculateEntityTotals(flows: any[], path: string[]): any {
    const entityTotals: any = {};

    // Initialize totals for each entity
    for (const entity of path) {
      entityTotals[entity] = {
        received: 0,
        sent: 0,
        balance: 0,
      };
    }

    // Calculate totals from flows
    for (const flow of flows) {
      if (entityTotals[flow.from]) {
        entityTotals[flow.from].sent += flow.amount;
        entityTotals[flow.from].balance -= flow.amount;
      }

      if (entityTotals[flow.to]) {
        entityTotals[flow.to].received += flow.amount;
        entityTotals[flow.to].balance += flow.amount;
      }
    }

    // Format amounts
    for (const entity in entityTotals) {
      entityTotals[entity].received = this.formatAmount(
        entityTotals[entity].received
      );
      entityTotals[entity].sent = this.formatAmount(entityTotals[entity].sent);
      entityTotals[entity].balance = this.formatAmount(
        entityTotals[entity].balance
      );
    }

    return entityTotals;
  }

  /**
   * Get flow summary by path (similar to flow diagram)
   */
  async getFlowSummaryByPath(path: string[]): Promise<any> {
    // Use the blockchain query method to get flows
    // If we have entities in config, use them with aliases
    let allFlows;
    if (this.config?.entities) {
      const entityObjects = this.config.entities.map((entity, index) => ({
        smartAddress: entity.smartAccount,
        alias: entity.alias || `Entity_${String.fromCharCode(65 + index)}`,
      }));
      allFlows = await this.getAllFlowsAsJSON(entityObjects);
    } else {
      allFlows = await this.getAllFlowsAsJSON();
    }

    // Find flows that match this specific path
    const pathKey = path.join('->');
    const matchingFlows = allFlows.filter(
      (flow) => flow.path.join('->') === pathKey
    );

    if (matchingFlows.length === 0) {
      return {
        path: path,
        totalFlows: 0,
        totalAmount: '0',
        stages: path.map((address, index) => ({
          stage: index + 1,
          address: address,
          role:
            index === 0
              ? 'sender'
              : index === path.length - 1
              ? 'receiver'
              : 'intermediary',
          received: '0',
          sent: '0',
          balance: '0',
        })),
      };
    }

    // Use the first matching flow (should be the complete path)
    const flow = matchingFlows[0];

    // Convert entity totals to stages format
    const stages = path.map((address, index) => {
      const entityTotals = flow.entityTotals[address] || {
        received: '0',
        sent: '0',
        balance: '0',
      };

      return {
        stage: index + 1,
        address: address,
        role:
          index === 0
            ? 'sender'
            : index === path.length - 1
            ? 'receiver'
            : 'intermediary',
        received: entityTotals.received,
        sent: entityTotals.sent,
        balance: entityTotals.balance,
      };
    });

    return {
      path: path,
      totalFlows: flow.totalFlows,
      totalAmount: flow.totalAmount,
      stages: stages,
      flows: flow.flows.map((individualFlow: any) => ({
        flowId: individualFlow.transactionHash,
        status: 'completed',
        amount: individualFlow.amount,
        startTime: new Date(individualFlow.timestamp).toISOString(),
        endTime: new Date(individualFlow.timestamp).toISOString(),
      })),
    };
  }

  /**
   * Get all flow summaries (for all tracked paths)
   */
  async getAllFlowSummaries(): Promise<any[]> {
    if (!this.flowConfig) return [];

    const summaries: any[] = [];
    const smartAddresses = this.flowConfig.smartAddresses;

    // Generate all possible paths (A->B->C, A->B, B->C, etc.)
    for (let i = 0; i < smartAddresses.length - 1; i++) {
      for (let j = i + 1; j < smartAddresses.length; j++) {
        const path = smartAddresses.slice(i, j + 1);
        const summary = await this.getFlowSummaryByPath(path);
        if (summary.totalFlows > 0) {
          summaries.push(summary);
        }
      }
    }

    return summaries;
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
    if (!this.cashTokenContract || !this.provider) {
      throw new Error('SDK not properly initialized');
    }

    const allFlowsData = await this.getAllFlowsAsJSON(entities);

    // Flatten all flows from the data structure
    const allFlows: any[] = [];
    allFlowsData.forEach((pathData: any) => {
      pathData.flows.forEach((flow: any) => {
        allFlows.push({
          ...flow,
          from: { address: flow.from, alias: flow.fromAlias },
          to: { address: flow.to, alias: flow.toAlias },
        });
      });
    });

    // Get simplified entity outcomes with flows
    const entityOutcomes = await this.getSimplifiedEntityOutcomesWithFlows(
      entities,
      allFlows
    );

    return {
      entityOutcomes: entityOutcomes,
      allFlows: allFlows,
    };
  }

  // Simplified entity outcomes method with flows
  private async getSimplifiedEntityOutcomesWithFlows(
    entities?: string[] | Array<{ smartAddress: string; alias: string }>,
    flows?: any[]
  ): Promise<
    Array<{
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
    }>
  > {
    if (!entities || !this.cashTokenContract) {
      return [];
    }

    const entityMap = new Map<
      string,
      {
        alias: string;
        sent: number;
        received: number;
        currentBalance: bigint;
        pendingAllowances: Array<{
          to: string;
          amount: string;
        }>;
        flows: Array<{
          from: string;
          to: string;
          amount: string;
          transactionHash: string;
          type: 'sent' | 'received';
        }>;
      }
    >();

    // Initialize entity map
    entities.forEach((entity) => {
      const address = typeof entity === 'string' ? entity : entity.smartAddress;
      const alias = typeof entity === 'string' ? entity : entity.alias;

      entityMap.set(address, {
        alias,
        sent: 0,
        received: 0,
        currentBalance: 0n,
        pendingAllowances: [],
        flows: [],
      });
    });

    // Get current balances and unused allowances
    for (const [address, entity] of entityMap.entries()) {
      try {
        // Get current balance
        const balance = await this.cashTokenContract.balanceOf(address);
        entity.currentBalance = balance;

        // Get unused allowances (pending) with spender information
        for (const [otherAddress, otherEntity] of entityMap.entries()) {
          if (address !== otherAddress) {
            try {
              const allowance = await this.cashTokenContract.allowance(
                address,
                otherAddress
              );
              if (allowance > 0n) {
                // Check if this allowance has been used
                const usedAmount = await this.getUsedAllowanceAmount(
                  address,
                  otherAddress
                );
                const unusedAmount = allowance - usedAmount;
                if (unusedAmount > 0n) {
                  entity.pendingAllowances.push({
                    to: otherEntity.alias || otherAddress,
                    amount: ethers.formatEther(unusedAmount),
                  });
                }
              }
            } catch (error) {
              console.warn(
                `Error getting allowance from ${address} to ${otherAddress}:`,
                error
              );
            }
          }
        }
      } catch (error) {
        console.warn(`Error getting balance for ${address}:`, error);
      }
    }

    // Calculate sent and received from flows and add relevant flows to each entity
    flows?.forEach((flow) => {
      const fromAddress = flow.from.address;
      const toAddress = flow.to.address;
      const amount = parseFloat(flow.amount);

      // Add flow to sender's flows (deduplicate by transaction hash)
      if (entityMap.has(fromAddress)) {
        const senderEntity = entityMap.get(fromAddress)!;
        senderEntity.sent += amount;

        // Check if this flow already exists for this entity
        const existingFlow = senderEntity.flows.find(
          (f) => f.transactionHash === flow.transactionHash && f.type === 'sent'
        );
        if (!existingFlow) {
          senderEntity.flows.push({
            from: flow.from.alias || flow.from.address,
            to: flow.to.alias || flow.to.address,
            amount: flow.amount,
            transactionHash: flow.transactionHash,
            type: 'sent',
          });
        }
      }

      // Add flow to receiver's flows (deduplicate by transaction hash)
      if (entityMap.has(toAddress)) {
        const receiverEntity = entityMap.get(toAddress)!;
        receiverEntity.received += amount;

        // Check if this flow already exists for this entity
        const existingFlow = receiverEntity.flows.find(
          (f) =>
            f.transactionHash === flow.transactionHash && f.type === 'received'
        );
        if (!existingFlow) {
          receiverEntity.flows.push({
            from: flow.from.alias || flow.from.address,
            to: flow.to.alias || flow.to.address,
            amount: flow.amount,
            transactionHash: flow.transactionHash,
            type: 'received',
          });
        }
      }
    });

    // Convert to simplified format
    return Array.from(entityMap.values()).map((entity) => ({
      alias: entity.alias,
      pending: entity.pendingAllowances,
      balance: ethers.formatEther(entity.currentBalance),
      sent: entity.sent.toString(),
      received: entity.received.toString(),
      flows: entity.flows,
    }));
  }

  // Helper method to get used allowance amount
  private async getUsedAllowanceAmount(
    owner: string,
    spender: string
  ): Promise<bigint> {
    try {
      // This is a simplified approach - in practice you'd need to track actual usage
      // For now, we'll assume allowances are unused if they exist
      return 0n;
    } catch (error) {
      return 0n;
    }
  }

  // New method to calculate entity outcomes
  private async calculateEntityOutcomes(
    entities?: string[] | Array<{ smartAddress: string; alias: string }>,
    flows?: any[],
    approvals?: ApprovalEvent[]
  ): Promise<EntityOutcome[]> {
    if (!entities || !flows) {
      return [];
    }

    const entityMap = new Map<
      string,
      {
        smartAddress: string;
        alias?: string;
        received: number;
        sent: number;
        pending: number;
      }
    >();

    // Initialize entity map
    entities.forEach((entity) => {
      const address = typeof entity === 'string' ? entity : entity.smartAddress;
      const alias = typeof entity === 'string' ? undefined : entity.alias;

      entityMap.set(address, {
        smartAddress: address,
        alias,
        received: 0,
        sent: 0,
        pending: 0,
      });
    });

    // Calculate received and sent from flows
    flows.forEach((flow) => {
      const fromAddress = flow.from.address;
      const toAddress = flow.to.address;
      const amount = parseFloat(flow.amount);

      if (entityMap.has(fromAddress)) {
        entityMap.get(fromAddress)!.sent += amount;
      }
      if (entityMap.has(toAddress)) {
        entityMap.get(toAddress)!.received += amount;
      }
    });

    // Calculate pending from approvals
    approvals?.forEach((approval) => {
      const ownerAddress = approval.owner.address;
      const amount = parseFloat(approval.amount);

      if (entityMap.has(ownerAddress)) {
        entityMap.get(ownerAddress)!.pending += amount;
      }
    });

    // Convert to EntityOutcome array
    return Array.from(entityMap.values()).map((entity) => ({
      smartAddress: entity.smartAddress,
      alias: entity.alias,
      balance: (entity.received - entity.sent).toString(),
      pending: entity.pending.toString(),
      received: entity.received.toString(),
      sent: entity.sent.toString(),
      netFlow: (entity.received - entity.sent).toString(),
    }));
  }

  // Helper method to find alias for an address
  private findAliasForAddress(
    address: string,
    entities?: string[] | Array<{ smartAddress: string; alias: string }>
  ): string | undefined {
    if (!entities) return undefined;

    const entity = entities.find(
      (e) => (typeof e === 'string' ? e : e.smartAddress) === address
    );

    return typeof entity === 'string' ? undefined : entity?.alias;
  }
}
