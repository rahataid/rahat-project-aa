/**
 * Deployment Store Service
 * Manages deployment file operations (read/write/backup)
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'fs';
import { join } from 'path';
import { Logger } from './_logger';

export interface DeploymentFile {
  CONTRACTS: Record<string, { address: string; startBlock: number }>;
  deployedAt?: string;
  network?: string;
  chainSettings?: any;
  subgraphUrl?: string | { url: string };
}

export class DeploymentStore {
  private deploymentsDir: string;

  constructor() {
    this.deploymentsDir = join(__dirname, '../deployments');
    if (!existsSync(this.deploymentsDir)) {
      mkdirSync(this.deploymentsDir, { recursive: true });
    }
  }

  /**
   * Save deployment data to file
   */
  async save(projectUUID: string, data: DeploymentFile): Promise<void> {
    const filePath = join(this.deploymentsDir, `${projectUUID}.json`);

    try {
      // Ensure deployedAt is set
      if (!data.deployedAt) {
        data.deployedAt = new Date().toISOString();
      }

      writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      Logger.info(`Deployment data saved: ${filePath}`);
    } catch (error) {
      Logger.error('Failed to save deployment data', error);
      throw error;
    }
  }

  /**
   * Load deployment data from file
   */
  async load(projectUUID: string): Promise<DeploymentFile | null> {
    const filePath = join(this.deploymentsDir, `${projectUUID}.json`);

    if (!existsSync(filePath)) {
      Logger.warn(`Deployment file not found: ${filePath}`);
      return null;
    }

    try {
      const content = readFileSync(filePath, 'utf8');
      const data = JSON.parse(content) as DeploymentFile;
      Logger.debug(`Deployment data loaded: ${filePath}`);
      return data;
    } catch (error) {
      Logger.error('Failed to load deployment data', error);
      throw error;
    }
  }

  /**
   * Update deployment file (merge with existing)
   */
  async update(projectUUID: string, updates: Partial<DeploymentFile>): Promise<void> {
    const existing = await this.load(projectUUID);
    const merged: DeploymentFile = {
      ...existing,
      ...updates,
      CONTRACTS: {
        ...existing?.CONTRACTS,
        ...updates.CONTRACTS,
      },
    };

    await this.save(projectUUID, merged);
    Logger.info(`Deployment data updated: ${projectUUID}`);
  }

  /**
   * Backup deployment file before changes
   */
  async backup(projectUUID: string): Promise<string> {
    const filePath = join(this.deploymentsDir, `${projectUUID}.json`);

    if (!existsSync(filePath)) {
      Logger.warn(`No deployment file to backup: ${filePath}`);
      return '';
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = join(
      this.deploymentsDir,
      `${projectUUID}-backup-${timestamp}.json`
    );

    copyFileSync(filePath, backupPath);
    Logger.info(`Backup created: ${backupPath}`);
    return backupPath;
  }

  /**
   * Get contract address from deployment file
   */
  async getContractAddress(
    projectUUID: string,
    contractName: string
  ): Promise<string | null> {
    const data = await this.load(projectUUID);
    if (!data || !data.CONTRACTS) {
      return null;
    }

    return data.CONTRACTS[contractName]?.address || null;
  }

  /**
   * Check if deployment file exists
   */
  exists(projectUUID: string): boolean {
    const filePath = join(this.deploymentsDir, `${projectUUID}.json`);
    return existsSync(filePath);
  }
}

