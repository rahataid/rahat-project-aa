import { ethers } from "ethers";
import {
  SDKConfig,
  Entity,
  SmartAccountDeploymentResult,
  ValidationResult,
} from "../types";
import { SDKError } from "../core/SDKError";
import { ValidationUtils } from "../utils/ValidationUtils";

/**
 * Entity Manager for handling smart accounts and entities
 * Based on patterns from 0.setup-smart-account.ts
 */
export class EntityManager {
  private provider: ethers.Provider | null = null;
  private config: SDKConfig | null = null;
  private entities: Map<string, Entity> = new Map();
  private activeEntityId: string | null = null;

  /**
   * Initialize the entity manager
   */
  async initialize(
    provider: ethers.Provider,
    config: SDKConfig
  ): Promise<void> {
    this.provider = provider;
    this.config = config;

    // Load existing entities from config if available
    if (config.entities && config.entities.length > 0) {
      for (const entityConfig of config.entities) {
        const entity: Entity = {
          id: `entity${this.entities.size + 1}`,
          privateKey: entityConfig.privateKey || "",
          address: entityConfig.address || "",
          smartAccount: entityConfig.smartAccount,
        };

        // Only create wallet if private key is provided (for write operations)
        if (entityConfig.privateKey) {
          try {
            const wallet = new ethers.Wallet(entityConfig.privateKey, provider);
            entity.wallet = wallet;
            entity.address = wallet.address;

            // Load smart account contract with wallet
            const smartAccountContract = new ethers.Contract(
              entity.smartAccount,
              this.getSmartAccountABI(),
              wallet
            );
            entity.smartAccountContract = smartAccountContract;
          } catch (error) {
            console.warn(
              `Warning: Could not create wallet for entity ${entity.id}: ${error}`
            );
            // Continue without wallet for read-only operations
          }
        } else {
          // For read-only operations, just store the smart account address
          console.log(
            `Entity ${entity.id}: Read-only mode (no private key provided)`
          );
        }

        this.entities.set(entity.id, entity);
      }

      // Set first entity as active
      if (this.entities.size > 0) {
        this.activeEntityId = Array.from(this.entities.keys())[0];
      }
    }
  }

  /**
   * Deploy smart account for a single entity
   * Based on the deployment pattern from 0.setup-smart-account.ts
   */
  async deploySmartAccount(privateKey: string): Promise<Entity> {
    if (!this.provider || !this.config) {
      throw SDKError.configError("Entity manager not initialized");
    }

    // Validate private key
    if (!ValidationUtils.validatePrivateKey(privateKey)) {
      throw SDKError.validationError("Invalid private key format");
    }

    try {
      const wallet = new ethers.Wallet(privateKey, this.provider);
      const entityId = `entity${this.entities.size + 1}`;

      console.log(
        `\n[${this.entities.size + 1}] Deploying Smart Account for ${
          wallet.address
        }`
      );

      // Create contract factory
      const SmartAccount = new ethers.ContractFactory(
        this.getSmartAccountABI(),
        this.getSmartAccountBytecode(),
        wallet
      );

      // Deploy SmartAccount with entry point
      const smartAccount = await SmartAccount.deploy(
        this.config.network.entryPoint
      );
      await smartAccount.waitForDeployment();
      const smartAccountAddress = await smartAccount.getAddress();

      console.log(`Smart Account deployed at: ${smartAccountAddress}`);

      // Create entity
      const entity: Entity = {
        id: entityId,
        privateKey,
        address: wallet.address,
        smartAccount: smartAccountAddress,
        wallet,
        smartAccountContract: smartAccount,
      };

      this.entities.set(entityId, entity);

      // Set as active if it's the first one
      if (this.entities.size === 1) {
        this.activeEntityId = entityId;
      }

      return entity;
    } catch (error) {
      const wallet = new ethers.Wallet(privateKey, this.provider!);
      throw SDKError.transactionFailed(
        `Failed to deploy smart account for ${wallet.address}`,
        { error }
      );
    }
  }

  /**
   * Deploy smart accounts for multiple entities
   */
  async deployMultiple(privateKeys: string[]): Promise<Entity[]> {
    const entities: Entity[] = [];

    for (let i = 0; i < privateKeys.length; i++) {
      const privateKey = privateKeys[i];

      try {
        const entity = await this.deploySmartAccount(privateKey);
        entities.push(entity);
      } catch (error) {
        console.error(`Failed to deploy smart account ${i + 1}:`, error);
        throw error;
      }
    }

    return entities;
  }

  /**
   * Load entities from configuration
   */
  loadFromConfig(config: SDKConfig): Entity[] {
    if (!config.entities) {
      return [];
    }

    const entities: Entity[] = [];

    for (let i = 0; i < config.entities.length; i++) {
      const entityConfig = config.entities[i];
      const entityId = `entity${i + 1}`;

      const entity: Entity = {
        id: entityId,
        privateKey: entityConfig.privateKey,
        address: entityConfig.address,
        smartAccount: entityConfig.smartAccount,
      };

      if (this.provider) {
        const wallet = new ethers.Wallet(
          entityConfig.privateKey,
          this.provider
        );
        entity.wallet = wallet;

        const smartAccountContract = new ethers.Contract(
          entityConfig.smartAccount,
          this.getSmartAccountABI(),
          wallet
        );
        entity.smartAccountContract = smartAccountContract;
      }

      this.entities.set(entityId, entity);
      entities.push(entity);
    }

    // Set first entity as active
    if (entities.length > 0) {
      this.activeEntityId = entities[0].id;
    }

    return entities;
  }

  /**
   * Get entity by ID
   */
  getEntity(entityId: string): Entity | null {
    return this.entities.get(entityId) || null;
  }

  /**
   * Get all entities
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get active entity
   */
  getActiveEntity(): Entity | null {
    if (!this.activeEntityId) {
      return null;
    }
    return this.entities.get(this.activeEntityId) || null;
  }

  /**
   * Switch active entity
   */
  async switchActiveEntity(entityId: string): Promise<void> {
    const entity = this.entities.get(entityId);
    if (!entity) {
      throw SDKError.entityNotFound(entityId);
    }

    this.activeEntityId = entityId;
  }

  /**
   * Validate entity setup
   */
  async validateEntity(entity: Entity): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check if smart account is deployed
    if (this.provider && entity.smartAccount) {
      try {
        const code = await this.provider.getCode(entity.smartAccount);
        if (code === "0x") {
          errors.push(`Smart account ${entity.smartAccount} is not deployed`);
        }
      } catch (error) {
        errors.push(`Failed to check smart account deployment: ${error}`);
      }
    }

    // Check wallet balance
    if (entity.wallet) {
      try {
        const balance = await entity.wallet.getBalance();
        if (balance === 0n) {
          warnings.push(`Wallet ${entity.address} has no ETH balance`);
        }
      } catch (error) {
        warnings.push(`Failed to check wallet balance: ${error}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Save entities configuration
   */
  async saveEntitiesConfig(filePath: string): Promise<void> {
    const entities = this.getAllEntities();
    const config = {
      network: this.config?.network.rpcUrl,
      entryPoint: this.config?.network.entryPoint,
      entities: entities.map((entity) => ({
        privateKey: entity.privateKey,
        address: entity.address,
        smartAccount: entity.smartAccount,
      })),
    };

    // This would typically use fs.writeFileSync
    console.log("Entities configuration:", JSON.stringify(config, null, 2));
  }

  /**
   * Get Smart Account ABI
   */
  private getSmartAccountABI(): any {
    return [
      "function execute(address dest, uint256 value, bytes calldata functionData) external",
      "function getEntryPoint() external view returns (address)",
      "function owner() external view returns (address)",
    ];
  }

  /**
   * Get Smart Account bytecode
   * This would typically be loaded from artifacts
   */
  private getSmartAccountBytecode(): string {
    // Try to load from artifacts
    try {
      const path = require("path");
      const fs = require("fs");

      // Try multiple possible paths for SmartAccount artifact
      const possiblePaths = [
        path.join(__dirname, "../artifacts/SmartAccountAbi.json"),
        path.join(
          __dirname,
          "../../../artifacts/contracts/SmartAccount.sol/SmartAccount.json"
        ),
        path.join(
          __dirname,
          "../../artifacts/contracts/SmartAccount.sol/SmartAccount.json"
        ),
        path.join(
          __dirname,
          "../artifacts/contracts/SmartAccount.sol/SmartAccount.json"
        ),
        process.env.SMART_ACCOUNT_ARTIFACT_PATH,
      ].filter(Boolean);

      for (const artifactPath of possiblePaths) {
        if (artifactPath && fs.existsSync(artifactPath)) {
          const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
          return artifact.bytecode;
        }
      }
    } catch (error) {
      console.warn(
        "Could not load SmartAccount artifact, using placeholder bytecode"
      );
    }

    // Fallback to placeholder - deployment will fail but loading existing entities will work
    return "0x..."; // Placeholder bytecode
  }
}
