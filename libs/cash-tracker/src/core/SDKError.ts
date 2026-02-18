import { SDKErrorCode, SDKError as ISDKError } from "../types";

/**
 * Custom SDK Error class for better error handling
 */
export class SDKError extends Error implements ISDKError {
  public readonly code: SDKErrorCode;
  public readonly details?: any;
  public readonly originalError?: Error;

  constructor(
    code: SDKErrorCode,
    message: string,
    details?: any,
    originalError?: Error
  ) {
    super(message);
    this.name = "SDKError";
    this.code = code;
    this.details = details;
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, SDKError);
    }
  }

  /**
   * Create an SDK error from a standard Error
   */
  static fromError(
    error: Error,
    code: SDKErrorCode = SDKErrorCode.NETWORK_ERROR
  ): SDKError {
    return new SDKError(
      code,
      error.message,
      { originalMessage: error.message },
      error
    );
  }

  /**
   * Create a validation error
   */
  static validationError(message: string, details?: any): SDKError {
    return new SDKError(SDKErrorCode.VALIDATION_ERROR, message, details);
  }

  /**
   * Create a configuration error
   */
  static configError(message: string, details?: any): SDKError {
    return new SDKError(SDKErrorCode.INVALID_CONFIG, message, details);
  }

  /**
   * Create an entity not found error
   */
  static entityNotFound(entityId: string): SDKError {
    return new SDKError(
      SDKErrorCode.ENTITY_NOT_FOUND,
      `Entity not found: ${entityId}`,
      { entityId }
    );
  }

  /**
   * Create a transaction failed error
   */
  static transactionFailed(message: string, details?: any): SDKError {
    return new SDKError(SDKErrorCode.TRANSACTION_FAILED, message, details);
  }

  /**
   * Create a network error
   */
  static networkError(message: string, details?: any): SDKError {
    return new SDKError(SDKErrorCode.NETWORK_ERROR, message, details);
  }

  /**
   * Create a tracking error
   */
  static trackingError(message: string, details?: any): SDKError {
    return new SDKError(SDKErrorCode.TRACKING_ERROR, message, details);
  }

  /**
   * Get error details as a formatted string
   */
  getDetailsString(): string {
    if (!this.details) return "";

    if (typeof this.details === "string") {
      return this.details;
    }

    return JSON.stringify(this.details, null, 2);
  }

  /**
   * Get full error information
   */
  getFullError(): string {
    let error = `${this.name}: ${this.message}`;

    if (this.details) {
      error += `\nDetails: ${this.getDetailsString()}`;
    }

    if (this.originalError) {
      error += `\nOriginal Error: ${this.originalError.message}`;
    }

    return error;
  }

  /**
   * Check if error is retryable
   */
  isRetryable(): boolean {
    return (
      this.code === SDKErrorCode.NETWORK_ERROR ||
      this.code === SDKErrorCode.TRANSACTION_FAILED
    );
  }
}

/**
 * Error utilities for common error patterns
 */
export class ErrorUtils {
  /**
   * Check if an error is an SDKError
   */
  static isSDKError(error: any): error is SDKError {
    return error instanceof SDKError;
  }

  /**
   * Extract error message from various error types
   */
  static getErrorMessage(error: any): string {
    if (ErrorUtils.isSDKError(error)) {
      return error.getFullError();
    }

    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    return "Unknown error occurred";
  }

  /**
   * Handle errors gracefully with logging
   */
  static handleError(error: any, context?: string): SDKError {
    const message = ErrorUtils.getErrorMessage(error);
    const contextMessage = context ? `[${context}] ${message}` : message;

    if (ErrorUtils.isSDKError(error)) {
      return error;
    }

    return new SDKError(SDKErrorCode.NETWORK_ERROR, contextMessage, {
      originalError: error,
    });
  }

  /**
   * Retry logic for retryable operations
   */
  static async retry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    delay: number = 1000
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          throw error;
        }

        // Only retry if it's a retryable error
        if (ErrorUtils.isSDKError(error) && !error.isRetryable()) {
          throw error;
        }

        // Wait before retrying
        await new Promise((resolve) => setTimeout(resolve, delay * attempt));
      }
    }

    throw lastError!;
  }
}
