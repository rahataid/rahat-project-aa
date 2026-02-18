/**
 * Secrets Manager Service
 * Provides secure access to sensitive data (private keys, tokens, etc.)
 * NEVER logs sensitive information
 */
import * as dotenv from 'dotenv';
import { PrismaService } from '@rumsan/prisma';
import { Logger } from './_logger';

// Load environment variables
dotenv.config({ path: `${__dirname}/../.env.setup` });
dotenv.config();

export class SecretsManager {
  private static prisma: PrismaService | null = null;

  /**
   * Get deployer private key securely
   * Priority: Environment variable > Database > Secrets Manager
   */
  static async getDeployerPrivateKey(): Promise<string> {
    // Try environment variable first
    const envKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (envKey && envKey.trim() !== '') {
      Logger.debug('Using DEPLOYER_PRIVATE_KEY from environment');
      return envKey.trim();
    }

    // Try database
    try {
      if (!this.prisma) {
        this.prisma = new PrismaService();
      }

      const setting = await this.prisma.setting.findUnique({
        where: { name: 'DEPLOYER_PRIVATE_KEY' },
      });

      if (setting?.value) {
        const dbKey = setting.value as string;
        Logger.debug('Using DEPLOYER_PRIVATE_KEY from database');
        return dbKey;
      }
    } catch (error) {
      Logger.warn('Failed to get DEPLOYER_PRIVATE_KEY from database', error);
    }

    // Try secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
    // TODO: Implement when secrets manager is configured
    // const secretsKey = await this.getFromSecretsManager('DEPLOYER_PRIVATE_KEY');
    // if (secretsKey) return secretsKey;

    throw new Error(
      'DEPLOYER_PRIVATE_KEY not found in environment, database, or secrets manager'
    );
  }

  /**
   * Get value from secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
   * Placeholder for future implementation
   */
  private static async getFromSecretsManager(
    key: string
  ): Promise<string | null> {
    // TODO: Implement AWS Secrets Manager integration
    // TODO: Implement HashiCorp Vault integration
    // TODO: Implement Azure Key Vault integration
    Logger.debug(`Secrets manager not configured, skipping ${key}`);
    return null;
  }

  /**
   * Get subgraph authentication token
   */
  static getSubgraphAuthToken(): string {
    const token = process.env.SUBGRAPH_AUTH_TOKEN;
    if (!token || token.trim() === '') {
      throw new Error('SUBGRAPH_AUTH_TOKEN not found in environment');
    }
    return token.trim();
  }

  /**
   * Get any environment variable securely
   */
  static getEnv(key: string, required = true): string {
    const value = process.env[key];
    if (required && (!value || value.trim() === '')) {
      throw new Error(`${key} not found in environment`);
    }
    return value?.trim() || '';
  }

  /**
   * Mask sensitive value for logging
   */
  static mask(value: string, showChars = 6): string {
    if (value.length <= showChars * 2) {
      return '*'.repeat(value.length);
    }
    return `${value.substring(0, showChars)}...${value.substring(
      value.length - 4
    )}`;
  }
}
