import { ethers } from 'ethers';
import { VALIDATION_PATTERNS } from './constants';

/**
 * Helper utilities for the SDK
 */

/**
 * Format amount with proper decimals
 */
export function formatAmount(amount: bigint, decimals: number): string {
  return ethers.formatUnits(amount, decimals);
}

/**
 * Parse amount from string to bigint
 */
export function parseAmount(amount: string, decimals: number): bigint {
  return ethers.parseUnits(amount, decimals);
}

/**
 * Format address for display
 */
export function formatAddress(address: string, length: number = 8): string {
  if (!address || address.length < length * 2 + 2) {
    return address;
  }
  return `${address.slice(0, length + 2)}...${address.slice(-length)}`;
}

/**
 * Generate a random string
 */
export function generateRandomString(length: number = 10): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique ID
 */
export function generateUniqueId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt - 1);
      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Debounce a function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

/**
 * Throttle a function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Array) {
    return obj.map((item) => deepClone(item)) as T;
  }

  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }

  return obj;
}

/**
 * Merge objects deeply
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = deepClone(target);

  for (const key in source) {
    if (source.hasOwnProperty(key)) {
      const sourceValue = source[key];
      const targetValue = result[key];

      if (
        sourceValue &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue)
      ) {
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        result[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return result;
}

/**
 * Validate Ethereum address
 */
export function isValidAddress(address: string): boolean {
  return VALIDATION_PATTERNS.ETHEREUM_ADDRESS.test(address);
}

/**
 * Validate private key
 */
export function isValidPrivateKey(privateKey: string): boolean {
  return VALIDATION_PATTERNS.PRIVATE_KEY.test(privateKey);
}

/**
 * Validate entity ID
 */
export function isValidEntityId(entityId: string): boolean {
  return VALIDATION_PATTERNS.ENTITY_ID.test(entityId);
}

/**
 * Convert bigint to string with proper formatting
 */
export function bigintToString(value: bigint, decimals: number = 18): string {
  return ethers.formatUnits(value, decimals);
}

/**
 * Convert string to bigint
 */
export function stringToBigint(value: string, decimals: number = 18): bigint {
  return ethers.parseUnits(value, decimals);
}

/**
 * Format gas price
 */
export function formatGasPrice(gasPrice: bigint): string {
  return ethers.formatUnits(gasPrice, 'gwei') + ' gwei';
}

/**
 * Format gas cost
 */
export function formatGasCost(gasUsed: bigint, gasPrice: bigint): string {
  const cost = gasUsed * gasPrice;
  return ethers.formatEther(cost) + ' ETH';
}

/**
 * Create a promise that rejects after a timeout
 */
export function timeoutPromise<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
}

/**
 * Check if a value is a valid number
 */
export function isValidNumber(value: any): boolean {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Check if a value is a valid string
 */
export function isValidString(value: any): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Sanitize input string
 */
export function sanitizeInput(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove potentially dangerous characters
  return input.replace(/[<>\"'&]/g, '');
}

/**
 * Truncate string to specified length
 */
export function truncateString(str: string, maxLength: number): string {
  if (str.length <= maxLength) {
    return str;
  }
  return str.slice(0, maxLength) + '...';
}

/**
 * Convert bytes to human readable format
 */
export function bytesToHumanReadable(bytes: number): string {
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 Bytes';

  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Get current timestamp
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}

/**
 * Get timestamp from date
 */
export function getTimestampFromDate(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Get date from timestamp
 */
export function getDateFromTimestamp(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Generate entity ID from index
 */
export function generateEntityId(index: number): string {
  return `entity${index + 1}`;
}

/**
 * Get entity IDs for a given count
 */
export function getEntityIds(count: number): string[] {
  return Array.from({ length: count }, (_, i) => generateEntityId(i));
}

/**
 * Resolve entities config path
 */
export function resolveEntitiesConfigPath(basePath?: string): string {
  const possiblePaths = [
    basePath,
    '../scripts/demo/config/entities.json',
    '../../scripts/demo/config/entities.json',
    process.env.ENTITIES_CONFIG_PATH,
    './entities.json',
  ].filter(Boolean);

  for (const path of possiblePaths) {
    if (path && require('fs').existsSync(path)) {
      return path;
    }
  }

  // Default fallback
  return '../scripts/demo/config/entities.json';
}
