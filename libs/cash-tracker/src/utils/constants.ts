/**
 * SDK Constants
 */

// Default configuration values
export const DEFAULT_CONFIG = {
  NETWORK: {
    RPC_URL: process.env.NETWORK_RPC_URL || "https://sepolia.base.org",
    ENTRY_POINT:
      process.env.ENTRY_POINT || "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
    CHAIN_ID: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 84532, // Base Sepolia
  },
  CONTRACTS: {
    CASH_TOKEN:
      process.env.CASH_TOKEN_ADDRESS ||
      "0xc3E3282048cB2F67b8e08447e95c37f181E00133",
  },
  OPTIONS: {
    GAS_LIMIT: process.env.GAS_LIMIT ? parseInt(process.env.GAS_LIMIT) : 500000,
    RETRY_ATTEMPTS: process.env.RETRY_ATTEMPTS
      ? parseInt(process.env.RETRY_ATTEMPTS)
      : 3,
    TIMEOUT: process.env.TIMEOUT ? parseInt(process.env.TIMEOUT) : 30000,
    TRACKING_INTERVAL: process.env.TRACKING_INTERVAL
      ? parseInt(process.env.TRACKING_INTERVAL)
      : 5000,
  },
} as const;

// Error messages
export const ERROR_MESSAGES = {
  SDK_NOT_INITIALIZED: "SDK not initialized",
  ENTITY_NOT_FOUND: "Entity not found",
  INVALID_PRIVATE_KEY: "Invalid private key format",
  INVALID_ADDRESS: "Invalid address format",
  INVALID_AMOUNT: "Invalid amount",
  NETWORK_ERROR: "Network error occurred",
  TRANSACTION_FAILED: "Transaction failed",
  CONFIG_ERROR: "Configuration error",
  VALIDATION_ERROR: "Validation error",
  TRACKING_ERROR: "Tracking error",
} as const;

// Event types
export const EVENT_TYPES = {
  // SDK Events
  SDK_INITIALIZED: "sdk_initialized",
  SDK_ERROR: "sdk_error",
  CONFIG_LOADED: "config_loaded",

  // Entity Events
  ENTITY_CREATED: "entity_created",
  ENTITY_UPDATED: "entity_updated",
  ENTITY_DELETED: "entity_deleted",
  ENTITY_SWITCHED: "entity_switched",

  // Operation Events
  OPERATION_STARTED: "operation_started",
  OPERATION_COMPLETED: "operation_completed",
  OPERATION_FAILED: "operation_failed",

  // Transaction Events
  TRANSACTION_SENT: "transaction_sent",
  TRANSACTION_CONFIRMED: "transaction_confirmed",
  TRANSACTION_FAILED: "transaction_failed",

  // Tracking Events
  TRACKING_STARTED: "tracking_started",
  TRACKING_STOPPED: "tracking_stopped",
  TRACKING_ERROR: "tracking_error",
  TRACKING_UPDATE: "tracking_update",

  // Balance Events
  BALANCE_CHANGED: "balance_changed",

  // Allowance Events
  ALLOWANCE_CHANGED: "allowance_changed",
} as const;

// Operation types
export const OPERATION_TYPES = {
  CHECK_BALANCE: "CHECK_BALANCE",
  APPROVE_TOKENS: "APPROVE_TOKENS",
  CHECK_ALLOWANCE: "CHECK_ALLOWANCE",
  TRANSFER_FROM: "TRANSFER_FROM",
  SWITCH_ACCOUNT: "SWITCH_ACCOUNT",
} as const;

// Validation patterns
export const VALIDATION_PATTERNS = {
  ETHEREUM_ADDRESS: /^0x[a-fA-F0-9]{40}$/,
  PRIVATE_KEY: /^[a-fA-F0-9]{64}$/,
  ENTITY_ID: /^[a-zA-Z0-9_-]+$/,
} as const;

// Gas limits
export const GAS_LIMITS = {
  MINIMUM: 21000,
  DEFAULT: 500000,
  MAXIMUM: 30000000,
} as const;

// Timeouts
export const TIMEOUTS = {
  DEFAULT: 30000,
  SHORT: 10000,
  LONG: 60000,
} as const;

// Tracking intervals
export const TRACKING_INTERVALS = {
  FAST: 1000,
  NORMAL: 5000,
  SLOW: 10000,
  VERY_SLOW: 30000,
} as const;

// File paths
export const FILE_PATHS = {
  CONFIG: "./config.json",
  ENTITIES: "./entities.json",
  LOGS: "./logs",
} as const;

// Environment variables
export const ENV_VARS = {
  NETWORK_RPC_URL: "NETWORK_RPC_URL",
  ENTRY_POINT: "ENTRY_POINT",
  CASH_TOKEN_ADDRESS: "CASH_TOKEN_ADDRESS",
  ENTITIES_PK: "ENTITIES_PK",
  GAS_LIMIT: "GAS_LIMIT",
  GAS_PRICE: "GAS_PRICE",
  MAX_FEE_PER_GAS: "MAX_FEE_PER_GAS",
  RETRY_ATTEMPTS: "RETRY_ATTEMPTS",
  TIMEOUT: "TIMEOUT",
} as const;

// Network configurations
export const NETWORKS = {
  BASE_SEPOLIA: {
    name: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
    chainId: process.env.BASE_SEPOLIA_CHAIN_ID
      ? parseInt(process.env.BASE_SEPOLIA_CHAIN_ID)
      : 84532,
    entryPoint:
      process.env.BASE_SEPOLIA_ENTRY_POINT ||
      "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  },
  BASE_MAINNET: {
    name: "Base Mainnet",
    rpcUrl: process.env.BASE_MAINNET_RPC_URL || "https://mainnet.base.org",
    chainId: process.env.BASE_MAINNET_CHAIN_ID
      ? parseInt(process.env.BASE_MAINNET_CHAIN_ID)
      : 8453,
    entryPoint:
      process.env.BASE_MAINNET_ENTRY_POINT ||
      "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
  },
} as const;

// Contract ABIs (minimal for type safety)
export const CONTRACT_ABIS = {
  SMART_ACCOUNT: [
    "function execute(address dest, uint256 value, bytes calldata functionData) external",
    "function validateUserOp(tuple userOp, bytes32 userOpHash, uint256 missingAccountFunds) external returns (uint256)",
    "function getEntryPoint() external view returns (address)",
    "function owner() external view returns (address)",
  ],
  CASH_TOKEN: [
    "function balanceOf(address account) view returns (uint256)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function transfer(address to, uint256 amount) returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
    "function totalSupply() view returns (uint256)",
    "function mint(address to, uint256 amount)",
    "function burn(address from, uint256 amount)",
  ],
} as const;
