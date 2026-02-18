import * as fs from "fs";
import * as path from "path";
import { SDKConfig, ConfigSource, ValidationResult } from "../types";
import { ValidationUtils } from "../utils/ValidationUtils";
import { SDKError } from "./SDKError";

/**
 * Configuration manager for the SDK
 */
export class ConfigManager {
  private config: SDKConfig | null = null;
  private configPath: string | null = null;

  /**
   * Load configuration from file
   */
  async loadFromFile(filePath: string): Promise<SDKConfig> {
    try {
      if (!fs.existsSync(filePath)) {
        throw SDKError.configError(`Configuration file not found: ${filePath}`);
      }

      const configData = fs.readFileSync(filePath, "utf8");
      const config = JSON.parse(configData);

      const validation = ValidationUtils.validateConfig(config);
      ValidationUtils.validateAndThrow(
        validation,
        "Configuration validation failed"
      );

      this.config = config;
      this.configPath = filePath;

      return config;
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw SDKError.configError(
        `Failed to load configuration from file: ${error}`,
        { filePath }
      );
    }
  }

  /**
   * Load configuration from environment variables
   */
  async loadFromEnv(): Promise<SDKConfig> {
    try {
      const config: SDKConfig = {
        network: {
          rpcUrl: process.env.NETWORK_RPC_URL || "",
          entryPoint: process.env.ENTRY_POINT || "",
        },
        contracts: {
          cashToken: process.env.CASH_TOKEN_ADDRESS || "",
        },
      };

      // Load entities from environment if available
      if (process.env.ENTITIES_PK) {
        const privateKeys = process.env.ENTITIES_PK.split(",");
        config.entities = privateKeys.map((pk, index) => ({
          privateKey: pk.trim(),
          address: "", // Will be derived from private key
          smartAccount: "", // Will be deployed or loaded
        }));
      }

      const validation = ValidationUtils.validateConfig(config);
      ValidationUtils.validateAndThrow(
        validation,
        "Environment configuration validation failed"
      );

      this.config = config;
      return config;
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw SDKError.configError(
        `Failed to load configuration from environment: ${error}`
      );
    }
  }

  /**
   * Load configuration from object
   */
  async loadFromObject(config: SDKConfig): Promise<SDKConfig> {
    try {
      const validation = ValidationUtils.validateConfig(config);
      ValidationUtils.validateAndThrow(
        validation,
        "Object configuration validation failed"
      );

      this.config = config;
      return config;
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw SDKError.configError(
        `Failed to load configuration from object: ${error}`
      );
    }
  }

  /**
   * Load configuration from multiple sources
   */
  async loadFromSource(source: ConfigSource): Promise<SDKConfig> {
    switch (source.type) {
      case "file":
        if (!source.path) {
          throw SDKError.configError("File path is required for file source");
        }
        return this.loadFromFile(source.path);

      case "env":
        return this.loadFromEnv();

      case "object":
        if (!source.data) {
          throw SDKError.configError("Data is required for object source");
        }
        return this.loadFromObject(source.data);

      default:
        throw SDKError.configError(
          `Unknown config source type: ${source.type}`
        );
    }
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config: SDKConfig, filePath?: string): Promise<void> {
    try {
      const targetPath = filePath || this.configPath || "sdk-config.json";
      const sanitizedConfig = this.sanitizeConfigForSaving(config);

      // Ensure directory exists
      const dir = path.dirname(targetPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(targetPath, JSON.stringify(sanitizedConfig, null, 2));
      this.configPath = targetPath;
    } catch (error) {
      throw SDKError.configError(
        `Failed to save configuration: ${error}`
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
   * Update configuration
   */
  async updateConfig(updates: Partial<SDKConfig>): Promise<SDKConfig> {
    if (!this.config) {
      throw SDKError.configError("No configuration loaded");
    }

    const updatedConfig = { ...this.config, ...updates };
    const validation = ValidationUtils.validateConfig(updatedConfig);
    ValidationUtils.validateAndThrow(
      validation,
      "Updated configuration validation failed"
    );

    this.config = updatedConfig;
    return updatedConfig;
  }

  /**
   * Validate current configuration
   */
  validateConfig(): ValidationResult {
    if (!this.config) {
      return {
        isValid: false,
        errors: ["No configuration loaded"],
        warnings: [],
      };
    }

    return ValidationUtils.validateConfig(this.config);
  }

  /**
   * Get configuration file path
   */
  getConfigPath(): string | null {
    return this.configPath;
  }

  /**
   * Create default configuration
   */
  static createDefaultConfig(): SDKConfig {
    return {
      network: {
        rpcUrl: process.env.NETWORK_RPC_URL || "https://sepolia.base.org",
        entryPoint:
          process.env.ENTRY_POINT ||
          "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",
      },
      contracts: {
        cashToken:
          process.env.CASH_TOKEN_ADDRESS ||
          "0xc3E3282048cB2F67b8e08447e95c37f181E00133",
      },
    };
  }

  /**
   * Sanitize configuration for saving (remove sensitive data)
   */
  private sanitizeConfigForSaving(config: SDKConfig): any {
    const sanitized = { ...config };

    // Remove private keys from entities
    if (sanitized.entities) {
      sanitized.entities = sanitized.entities.map((entity) => ({
        ...entity,
        privateKey: "[REDACTED]",
      }));
    }

    return sanitized;
  }

  /**
   * Load entities configuration from demo format
   */
  async loadEntitiesFromDemoFormat(filePath: string): Promise<SDKConfig> {
    try {
      if (!fs.existsSync(filePath)) {
        throw SDKError.configError(`Entities file not found: ${filePath}`);
      }

      const entitiesData = JSON.parse(fs.readFileSync(filePath, "utf8"));

      const config: SDKConfig = {
        network: {
          rpcUrl: entitiesData.network,
          entryPoint: entitiesData.entryPoint,
        },
        contracts: {
          cashToken:
            process.env.CASH_TOKEN ||
            "0xc3E3282048cB2F67b8e08447e95c37f181E00133", // Use env or default from demo
        },
        entities: entitiesData.entities.map((entity: any, index: number) => ({
          privateKey: entity.privateKey,
          address: entity.address,
          smartAccount: entity.smartAccount,
        })),
      };

      const validation = ValidationUtils.validateConfig(config);
      ValidationUtils.validateAndThrow(
        validation,
        "Demo format configuration validation failed"
      );

      this.config = config;
      return config;
    } catch (error) {
      if (error instanceof SDKError) {
        throw error;
      }
      throw SDKError.configError(
        `Failed to load entities from demo format: ${error}`
      );
    }
  }
}
