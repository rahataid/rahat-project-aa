import { ethers } from 'ethers';
import { SDKError } from '../core/SDKError';
import {
  FlowTrackingConfig,
  SDKConfig,
  TokenAllowance,
  TokenBalance,
  TokenFlow,
  TokenFlowData,
} from '../types';

/**
 * Flow Tracking Manager for monitoring token flow between smart addresses
 * Uses GraphQL endpoint for efficient data retrieval
 */
export class FlowTrackingManager {
  private provider: ethers.Provider | null = null;
  private cashTokenContract: ethers.Contract | null = null;
  private config: SDKConfig | null = null;
  private flowConfig: FlowTrackingConfig | null = null;
  private previousBalances: Map<string, bigint> = new Map();
  private previousAllowances: Map<string, Map<string, bigint>> = new Map();
  private graphqlEndpoint: string =
    'https://api.studio.thegraph.com/query/89203/cash-tracker-dev/version/latest/graphql';

  constructor() {}

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
   * Execute GraphQL query
   */
  private async executeGraphQLQuery(
    query: string,
    variables?: any
  ): Promise<any> {
    try {
      const response = await fetch(this.graphqlEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          variables,
        }),
      });

      if (!response.ok) {
        throw new Error(`GraphQL request failed: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
      }

      return result.data;
    } catch (error) {
      console.error('GraphQL query failed:', error);
      throw error;
    }
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
   * Format amount with decimals
   */
  private formatAmount(amount: bigint): string {
    // This would need to be implemented with proper decimal handling
    return amount.toString();
  }

  /**
   * Get all flows as JSON using GraphQL
   * This queries indexed data from The Graph
   *
   * @param entities - Array of strings (addresses) or array of objects with smartAddress and alias
   */
  async getAllFlowsAsJSON(
    entities?: string[] | Array<{ smartAddress: string; alias: string }>
  ): Promise<any[]> {
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
        return [];
      }
    }

    if (trackedAddresses.length < 1) {
      return [];
    }

    try {
      // Get transfers from GraphQL
      const transfers = await this.getTransfersFromGraphQL(trackedAddresses);

      // Process and group flows
      const allFlows: any[] = [];
      const groupedFlows = this.groupTransfersByPath(
        transfers,
        trackedAddresses
      );

      // Convert to JSON format
      for (const [pathKey, pathFlows] of groupedFlows.entries()) {
        const path = pathKey.split('->');
        const totalAmount = pathFlows.reduce(
          (sum: number, flow: any) =>
            sum + parseFloat(ethers.formatEther(flow.amount)),
          0
        );

        // Calculate entity totals
        const entityTotals = this.calculateEntityTotalsFromGraphQL(
          pathFlows,
          path
        );

        allFlows.push({
          path: path,
          pathAliases: path.map((addr) => aliasMap.get(addr) || addr),
          totalFlows: pathFlows.length,
          totalAmount: totalAmount.toString(),
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
            amount: ethers.formatEther(flow.amount),
            type: 'transfer',
            transactionHash: flow.transactionHash,
            blockNumber: flow.blockNumber,
            timestamp: parseInt(flow.timestamp) * 1000,
          })),
        });
      }

      return allFlows;
    } catch (error) {
      console.error('Error querying GraphQL for flows:', error);
      return [];
    }
  }

  /**
   * Process transfer events to extract flows
   */
  private async processTransferEvents(
    transferEvents: any[],
    trackedAddresses: string[]
  ): Promise<any[]> {
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
          const block = await this.provider?.getBlock(event.blockNumber);
          flows.push({
            from: fromAddr,
            to: toAddr,
            amount: amount,
            type: 'transfer',
            transactionHash: event.transactionHash,
            blockNumber: event.blockNumber,
            timestamp: (block?.timestamp ?? 0) * 1000, // We'll get actual timestamp later if needed
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
   * Uses GraphQL for efficient data retrieval
   */
  async getTransactionFlowHistory(
    entities?: string[] | Array<{ smartAddress: string; alias: string }>
  ): Promise<{
    entityOutcomes: Array<{
      alias: string;
      allowances: Array<{
        to: string;
        amount: string;
        timestamp: number;
      }>;
      pending: Array<{
        from: string;
        amount: string;
        timestamp: number;
      }>;
      balance: string;
    }>;
    allFlows: any[];
  }> {
    if (!entities || entities.length === 0) {
      throw new Error('Entities are required for transaction flow history');
    }

    // Prepare entity addresses and aliases
    const entityMap = new Map<string, string>();
    const addresses: string[] = [];

    entities.forEach((entity) => {
      if (typeof entity === 'string') {
        addresses.push(entity);
        entityMap.set(entity, entity);
      } else {
        addresses.push(entity.smartAddress);
        entityMap.set(entity.smartAddress, entity.alias);
      }
    });

    // Query GraphQL for comprehensive data
    const [transfers, approvals, balances] = await Promise.all([
      this.getTransfersFromGraphQL(addresses),
      this.getApprovalsFromGraphQL(addresses),
      this.getBalancesFromGraphQL(addresses),
    ]);

    // Process entity outcomes
    const entityOutcomes = this.processEntityOutcomes(
      addresses,
      entityMap,
      transfers,
      approvals,
      balances
    );

    // Process all flows
    const allFlows = this.processAllFlows(transfers, entityMap);

    return {
      entityOutcomes,
      allFlows,
    };
  }

  /**
   * Get transfers from GraphQL
   */
  private async getTransfersFromGraphQL(addresses: string[]): Promise<any[]> {
    const query = `
      query GetTransfers($addresses: [String!]!) {
        transfers(
          where: {
            or: [
              { from_in: $addresses },
              { to_in: $addresses }
            ]
          }
          orderBy: timestamp
          orderDirection: desc
          first: 1000
        ) {
          id
          from
          to
          amount
          timestamp
          transactionHash
          blockNumber
        }
      }
    `;

    const result = await this.executeGraphQLQuery(query, { addresses });
    return result.transfers || [];
  }

  /**
   * Get approvals from GraphQL
   */
  private async getApprovalsFromGraphQL(addresses: string[]): Promise<any[]> {
    const query = `
      query GetApprovals($addresses: [String!]!) {
        approvals(
          where: {
            or: [
              { owner_in: $addresses },
              { spender_in: $addresses }
            ]
          }
          orderBy: timestamp
          orderDirection: desc
          first: 1000
        ) {
          id
          owner
          spender
          amount
          timestamp
          transactionHash
          blockNumber
        }
      }
    `;

    const result = await this.executeGraphQLQuery(query, { addresses });
    return result.approvals || [];
  }

  /**
   * Get current balances from GraphQL
   */
  private async getBalancesFromGraphQL(addresses: string[]): Promise<any[]> {
    const query = `
      query GetBalances($addresses: [String!]!) {
        balances(
          where: { account_in: $addresses }
        ) {
          id
          account
          amount
          timestamp
        }
      }
    `;

    const result = await this.executeGraphQLQuery(query, { addresses });
    return result.balances || [];
  }

  /**
   * Process entity outcomes from GraphQL data
   */
  private processEntityOutcomes(
    addresses: string[],
    entityMap: Map<string, string>,
    transfers: any[],
    approvals: any[],
    balances: any[]
  ): Array<{
    alias: string;
    allowances: Array<{
      to: string;
      amount: string;
      timestamp: number;
    }>;
    pending: Array<{
      from: string;
      amount: string;
      timestamp: number;
    }>;
    balance: string;
  }> {
    const outcomes: Array<{
      alias: string;
      allowances: Array<{
        to: string;
        amount: string;
        timestamp: number;
      }>;
      pending: Array<{
        from: string;
        amount: string;
        timestamp: number;
      }>;
      balance: string;
    }> = [];

    addresses.forEach((address) => {
      const alias = entityMap.get(address) || address;

      // Get current balance
      const balanceData = balances.find(
        (b) => b.account.toLowerCase() === address.toLowerCase()
      );
      const balance = balanceData
        ? ethers.formatEther(balanceData.amount)
        : '0';

      // Get allowances provided by this entity (where this entity is the owner)
      const entityAllowances = approvals
        .filter(
          (approval) =>
            approval.owner.toLowerCase() === address.toLowerCase() &&
            parseFloat(ethers.formatEther(approval.amount)) > 0
        )
        .map((approval) => ({
          to: entityMap.get(approval.spender) || approval.spender,
          amount: ethers.formatEther(approval.amount),
          timestamp: parseInt(approval.timestamp) * 1000,
        }));

      // Get pending allowances (where this entity is the spender with unused allowances)
      const pendingAllowances = approvals
        .filter(
          (approval) =>
            approval.spender.toLowerCase() === address.toLowerCase() &&
            parseFloat(ethers.formatEther(approval.amount)) > 0
        )
        .map((approval) => ({
          from: entityMap.get(approval.owner) || approval.owner,
          amount: ethers.formatEther(approval.amount),
          timestamp: parseInt(approval.timestamp) * 1000,
        }));

      outcomes.push({
        alias,
        allowances: entityAllowances,
        pending: pendingAllowances,
        balance,
      });
    });

    return outcomes;
  }

  /**
   * Process all flows from GraphQL data
   */
  private processAllFlows(
    transfers: any[],
    entityMap: Map<string, string>
  ): any[] {
    return transfers.map((transfer) => ({
      id: transfer.id,
      from: {
        address: transfer.from,
        alias: entityMap.get(transfer.from) || transfer.from,
      },
      to: {
        address: transfer.to,
        alias: entityMap.get(transfer.to) || transfer.to,
      },
      amount: ethers.formatEther(transfer.amount),
      timestamp: parseInt(transfer.timestamp) * 1000,
      transactionHash: transfer.transactionHash,
      blockNumber: transfer.blockNumber,
      type: 'transfer',
    }));
  }

  /**
   * Group transfers by path from GraphQL data
   */
  private groupTransfersByPath(
    transfers: any[],
    trackedAddresses: string[]
  ): Map<string, any[]> {
    const groupedFlows = new Map<string, any[]>();
    const trackedAddressesChecksum = trackedAddresses.map((addr) =>
      ethers.getAddress(addr)
    );

    // Find all possible paths through tracked addresses
    const paths = this.generateAllPaths(trackedAddressesChecksum);

    for (const path of paths) {
      const pathKey = path.join('->');
      const pathFlows: any[] = [];

      // Find flows that follow this path
      for (let i = 0; i < path.length - 1; i++) {
        const from = path[i];
        const to = path[i + 1];

        const matchingFlows = transfers.filter(
          (transfer) =>
            ethers.getAddress(transfer.from) === from &&
            ethers.getAddress(transfer.to) === to
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
   * Calculate entity totals from GraphQL data
   */
  private calculateEntityTotalsFromGraphQL(flows: any[], path: string[]): any {
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
      const amount = parseFloat(ethers.formatEther(flow.amount));

      if (entityTotals[flow.from]) {
        entityTotals[flow.from].sent += amount;
        entityTotals[flow.from].balance -= amount;
      }

      if (entityTotals[flow.to]) {
        entityTotals[flow.to].received += amount;
        entityTotals[flow.to].balance += amount;
      }
    }

    // Format amounts as strings
    for (const entity in entityTotals) {
      entityTotals[entity].received = entityTotals[entity].received.toString();
      entityTotals[entity].sent = entityTotals[entity].sent.toString();
      entityTotals[entity].balance = entityTotals[entity].balance.toString();
    }

    return entityTotals;
  }
}
