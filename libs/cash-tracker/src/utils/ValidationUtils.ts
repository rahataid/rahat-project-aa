import { SDKError } from "../core/SDKError";
import { ValidationResult } from "../types";

/**
 * Validation utilities for the SDK
 */
export class ValidationUtils {
  /**
   * Validate Ethereum address format
   */
  static validateAddress(address: string): boolean {
    if (!address || typeof address !== "string") {
      return false;
    }

    // Check if it's a valid Ethereum address format
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    return addressRegex.test(address);
  }

  /**
   * Validate private key format
   */
  static validatePrivateKey(privateKey: string): boolean {
    if (!privateKey || typeof privateKey !== "string") {
      return false;
    }

    // Check if it's a valid private key format (64 hex characters)
    const privateKeyRegex = /^[a-fA-F0-9]{64}$/;
    return privateKeyRegex.test(privateKey);
  }

  /**
   * Validate amount (positive number or bigint)
   */
  static validateAmount(amount: string | number | bigint): boolean {
    if (typeof amount === "bigint") {
      return amount > 0n;
    }

    if (typeof amount === "number") {
      return amount > 0 && isFinite(amount);
    }

    if (typeof amount === "string") {
      const num = parseFloat(amount);
      return !isNaN(num) && num > 0;
    }

    return false;
  }

  /**
   * Validate entity ID format
   */
  static validateEntityId(entityId: string): boolean {
    if (!entityId || typeof entityId !== "string") {
      return false;
    }

    // Entity ID should be alphanumeric and can contain hyphens/underscores
    const entityIdRegex = /^[a-zA-Z0-9_-]+$/;
    return entityIdRegex.test(entityId);
  }

  /**
   * Validate network RPC URL
   */
  static validateRpcUrl(url: string): boolean {
    if (!url || typeof url !== "string") {
      return false;
    }

    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }

  /**
   * Validate configuration object
   */
  static validateConfig(config: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check required fields
    if (!config) {
      errors.push("Configuration is required");
      return { isValid: false, errors, warnings };
    }

    if (!config.network) {
      errors.push("Network configuration is required");
    } else {
      if (!config.network.rpcUrl) {
        errors.push("Network RPC URL is required");
      } else if (!this.validateRpcUrl(config.network.rpcUrl)) {
        errors.push("Invalid network RPC URL format");
      }

      if (!config.network.entryPoint) {
        errors.push("Entry point address is required");
      } else if (!this.validateAddress(config.network.entryPoint)) {
        errors.push("Invalid entry point address format");
      }
    }

    if (!config.contracts) {
      errors.push("Contracts configuration is required");
    } else {
      if (!config.contracts.cashToken) {
        errors.push("Cash token address is required");
      } else if (!this.validateAddress(config.contracts.cashToken)) {
        errors.push("Invalid cash token address format");
      }
    }

    // Validate entities if provided
    if (config.entities && Array.isArray(config.entities)) {
      for (let i = 0; i < config.entities.length; i++) {
        const entity = config.entities[i];
        const entityErrors = this.validateEntity(entity, i);
        errors.push(...entityErrors);
      }
    }

    // Check for warnings
    if (config.options) {
      if (config.options.gasLimit && config.options.gasLimit < 21000) {
        warnings.push("Gas limit seems too low (minimum 21000)");
      }

      if (config.options.retryAttempts && config.options.retryAttempts > 10) {
        warnings.push("High retry attempts may cause performance issues");
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate entity configuration
   */
  static validateEntity(entity: any, index?: number): string[] {
    const errors: string[] = [];
    const prefix = index !== undefined ? `Entity ${index}: ` : "Entity: ";

    if (!entity) {
      errors.push(`${prefix}Entity configuration is required`);
      return errors;
    }

    if (!entity.privateKey) {
      errors.push(`${prefix}Private key is required`);
    } else if (!this.validatePrivateKey(entity.privateKey)) {
      errors.push(`${prefix}Invalid private key format`);
    }

    if (!entity.address) {
      errors.push(`${prefix}Address is required`);
    } else if (!this.validateAddress(entity.address)) {
      errors.push(`${prefix}Invalid address format`);
    }

    if (!entity.smartAccount) {
      errors.push(`${prefix}Smart account address is required`);
    } else if (!this.validateAddress(entity.smartAccount)) {
      errors.push(`${prefix}Invalid smart account address format`);
    }

    return errors;
  }

  /**
   * Validate operation parameters
   */
  static validateOperationParams(
    operationType: string,
    params: any
  ): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (operationType) {
      case "approve":
        if (!params.spenderId) {
          errors.push("Spender ID is required for approval");
        }
        if (!params.amount) {
          errors.push("Amount is required for approval");
        } else if (!this.validateAmount(params.amount)) {
          errors.push("Invalid amount for approval");
        }
        break;

      case "transfer":
        if (!params.toId) {
          errors.push("Recipient ID is required for transfer");
        }
        if (!params.amount) {
          errors.push("Amount is required for transfer");
        } else if (!this.validateAmount(params.amount)) {
          errors.push("Invalid amount for transfer");
        }
        break;

      case "transferFrom":
        if (!params.fromId) {
          errors.push("From ID is required for transferFrom");
        }
        if (!params.toId) {
          errors.push("To ID is required for transferFrom");
        }
        if (!params.amount) {
          errors.push("Amount is required for transferFrom");
        } else if (!this.validateAmount(params.amount)) {
          errors.push("Invalid amount for transferFrom");
        }
        break;

      default:
        warnings.push(`Unknown operation type: ${operationType}`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate tracking options
   */
  static validateTrackingOptions(options: any): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (
      options.interval &&
      (typeof options.interval !== "number" || options.interval < 1000)
    ) {
      errors.push("Tracking interval must be at least 1000ms");
    }

    if (options.entities && !Array.isArray(options.entities)) {
      errors.push("Entities must be an array");
    }

    if (options.interval && options.interval > 60000) {
      warnings.push("High tracking interval may cause delays in updates");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Sanitize input string
   */
  static sanitizeInput(input: string): string {
    if (typeof input !== "string") {
      return "";
    }

    // Remove potentially dangerous characters
    return input.replace(/[<>\"'&]/g, "");
  }

  /**
   * Validate and throw error if invalid
   */
  static validateAndThrow(
    validation: ValidationResult,
    context?: string
  ): void {
    if (!validation.isValid) {
      const message = context
        ? `${context}: ${validation.errors.join(", ")}`
        : validation.errors.join(", ");
      throw SDKError.validationError(message, { validation });
    }
  }
}
