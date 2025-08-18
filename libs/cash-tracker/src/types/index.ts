// Core SDK Types
export interface SDKConfig {
  network: {
    rpcUrl: string;
    chainId?: number;
    entryPoint: string;
  };
  contracts: {
    cashToken: string;
    smartAccountFactory?: string;
    cashtokenAbi?: any; // ABI for cash token contract
    entitySmartAccount?: string; // Smart account address for this entity
    defaultPrivatekey?: string; // Default private key for this entity
  };
  entities?: EntityConfig[];
  flowTracking?: FlowTrackingConfig; // New flow tracking configuration
}

export interface FlowTrackingConfig {
  smartAddresses: string[]; // Array of smart addresses to track flow between
  interval?: number; // Tracking interval in milliseconds
  onFlowUpdate?: (flowData: TokenFlowData) => void; // Callback for flow updates
}

export interface TokenFlowData {
  timestamp: number;
  flows: TokenFlow[];
  balances: TokenBalance[];
  allowances: TokenAllowance[];
}

export interface TokenFlow {
  from: string;
  to: string;
  amount: bigint;
  formatted: string;
  transactionHash?: string;
  timestamp: number;
  type: 'transfer' | 'allowance' | 'balance_change';
}

export interface FlowHistoryEntry {
  step: number;
  from: string;
  to: string;
  amount: bigint;
  formatted: string;
  transactionHash?: string;
  timestamp: number;
  type: 'transfer' | 'allowance' | 'balance_change';
  blockNumber?: number;
}

export interface FlowHistory {
  flowId: string;
  startTime: number;
  endTime?: number;
  path: string[]; // A->B->C path
  entries: FlowHistoryEntry[];
  totalAmount: bigint;
  formattedTotalAmount: string;
  status: 'active' | 'completed' | 'failed';
  description?: string;
}

export interface FlowHistoryOptions {
  maxHistory?: number; // Maximum number of flow histories to keep
  includeBlockNumbers?: boolean;
  includeDescriptions?: boolean;
}

export interface EntityConfig {
  privateKey: string;
  address: string;
  smartAccount: string;
  alias?: string; // Optional alias for the entity
}

export interface Entity {
  id: string;
  privateKey: string;
  address: string;
  smartAccount: string;
  wallet?: any; // ethers.Wallet
  smartAccountContract?: any; // ethers.Contract
}

// Comprehensive Transaction Flow History Types
export interface TransactionFlowSummary {
  totalPaths: number;
  totalFlows: number;
  totalAmount: string;
  totalTransactions: number;
  timeRange: {
    start: string;
    end: string;
  };
}

export interface TransactionFlowPath {
  id: string;
  path: string[];
  pathAliases: string[];
  totalFlows: number;
  totalAmount: string;
  entityTotals: Record<
    string,
    {
      received: string;
      sent: string;
      balance: string;
    }
  >;
  entityTotalsWithAliases: Record<
    string,
    {
      received: string;
      sent: string;
      balance: string;
    }
  >;
}

export interface TransactionFlowStep {
  stepId: string;
  stepNumber: number;
  from: {
    address: string;
    alias: string;
    role: 'sender' | 'intermediary' | 'receiver';
  };
  to: {
    address: string;
    alias: string;
    role: 'sender' | 'intermediary' | 'receiver';
  };
  amount: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  status: 'completed' | 'pending' | 'failed';
}

export interface TransactionFlow {
  flowId: string;
  pathId: string;
  from: {
    address: string;
    alias: string;
  };
  to: {
    address: string;
    alias: string;
  };
  amount: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  type: 'transfer' | 'allowance' | 'balance_change';
}

export interface BlockchainInfo {
  network: string;
  contractAddress: string;
  lastBlockNumber: number;
  queryTimestamp: number;
}

export interface TransactionFlowHistory {
  summary: TransactionFlowSummary;
  paths: TransactionFlowPath[];
  steps: TransactionFlowStep[];
  flows: TransactionFlow[];
  blockchainInfo: BlockchainInfo;
  entities: EntityOutcome[]; // New: Final state of each entity
  approvals: ApprovalEvent[]; // New: Approval events
}

// New interfaces for entity outcomes
export interface EntityOutcome {
  smartAddress: string;
  alias?: string;
  balance: string;
  pending: string; // Total amount approved by this entity to others
  received: string; // Total amount received
  sent: string; // Total amount sent
  netFlow: string; // received - sent
}

// New interfaces for approval events
export interface ApprovalEvent {
  approvalId: string;
  owner: {
    address: string;
    alias?: string;
  };
  spender: {
    address: string;
    alias?: string;
  };
  amount: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
  type: 'approval' | 'approvalForAll' | 'transferFrom';
  status: 'completed' | 'pending';
}

// Operation Types
export interface TokenBalance {
  entityId: string;
  balance: bigint;
  formatted: string;
  decimals: number;
  symbol: string;
}

export interface TokenAllowance {
  ownerId: string;
  spenderId: string;
  allowance: bigint;
  formatted: string;
}

export interface TransactionResult {
  hash: string;
  status: 'pending' | 'confirmed' | 'failed';
  receipt?: any; // TransactionReceipt
  error?: string;
  gasUsed?: bigint;
  gasPrice?: bigint;
}

export interface GasEstimate {
  gasLimit: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  totalCost: bigint;
}

// Tracking Types
export interface TrackingOptions {
  interval?: number; // milliseconds
  entities?: string[];
  includeBalances?: boolean;
  includeAllowances?: boolean;
  onUpdate?: (state: TrackingState) => void;
}

export interface TrackingState {
  balances: TokenBalance[];
  allowances: TokenAllowance[];
  timestamp: number;
  lastUpdate: number;
}

export interface BalanceEvent {
  entityId: string;
  previousBalance: bigint;
  newBalance: bigint;
  change: bigint;
  timestamp: number;
}

export interface AllowanceEvent {
  ownerId: string;
  spenderId: string;
  previousAllowance: bigint;
  newAllowance: bigint;
  change: bigint;
  timestamp: number;
}

// Event Types
export interface EventFilter {
  entityIds?: string[];
  eventTypes?: ('balance' | 'allowance')[];
  fromTimestamp?: number;
  toTimestamp?: number;
}

export interface TrackingSession {
  id: string;
  isActive: boolean;
  startTime: number;
  options: TrackingOptions;
  stop: () => void;
  on: (event: string, callback: (event: any) => void) => void;
  off: (event: string, callback: (event: any) => void) => void;
}

// Validation Types
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Configuration Types
export interface ConfigSource {
  type: 'file' | 'env' | 'object';
  path?: string;
  data?: any;
}

// Error Types
export enum SDKErrorCode {
  INVALID_CONFIG = 'INVALID_CONFIG',
  ENTITY_NOT_FOUND = 'ENTITY_NOT_FOUND',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TRACKING_ERROR = 'TRACKING_ERROR',
}

export interface SDKError {
  code: SDKErrorCode;
  message: string;
  details?: any;
  originalError?: Error;
}

// Operation Types
export enum OperationType {
  CHECK_BALANCE = 'CHECK_BALANCE',
  APPROVE_TOKENS = 'APPROVE_TOKENS',
  CHECK_ALLOWANCE = 'CHECK_ALLOWANCE',
  TRANSFER_FROM = 'TRANSFER_FROM',
  SWITCH_ACCOUNT = 'SWITCH_ACCOUNT',
}

export interface Operation {
  type: OperationType;
  params: any;
  entityId?: string;
  gasEstimate?: GasEstimate;
}

// Smart Account Types
export interface SmartAccountInfo {
  address: string;
  owner: string;
  entryPoint: string;
  deployed: boolean;
  balance?: bigint;
}

export interface SmartAccountDeploymentResult {
  smartAccount: SmartAccountInfo;
  transaction: TransactionResult;
  entity: Entity;
}
