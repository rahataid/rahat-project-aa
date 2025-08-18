// ABI imports - using require for JSON files
const CashTokenAbi = require('./artifacts/CashTokenAbi.json');
const SmartAccountAbi = require('./artifacts/SmartAccountAbi.json');

// Main SDK exports
export { CashTokenSDK } from './core/CashTokenSDK';
export { ConfigManager } from './core/ConfigManager';
export { SDKError, ErrorUtils } from './core/SDKError';

// Manager exports
export { EntityManager } from './entities/EntityManager';
export { OperationsManager } from './operations/OperationsManager';
export { TrackingManager } from './tracking/TrackingManager';
export { FlowTrackingManager } from './tracking/FlowTrackingManager';
export { EventManager } from './tracking/EventManager';

// Utility exports
export { ValidationUtils } from './utils/ValidationUtils';
export * from './utils/constants';
export * from './utils/helpers';

// ABI exports
export { CashTokenAbi, SmartAccountAbi };

// Type exports
export * from './types';

// Re-export ethers for convenience
export { ethers } from 'ethers';
