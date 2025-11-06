/**
 * Deployment State Manager
 * Tracks deployment progress and enables resumability
 */
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
} from 'fs';
import { join } from 'path';
import { Logger } from './_logger';

export interface DeploymentState {
  projectUUID: string;
  startedAt: string;
  lastCheckpoint?: string;
  completedSteps: string[];
  failedSteps: string[];
  deployedContracts: Record<string, { address: string; blockNumber: number }>;
  status: 'in-progress' | 'completed' | 'failed' | 'rolled-back';
  metadata?: Record<string, any>;
}

export class StateManager {
  private stateDir: string;
  private stateFile: string;

  constructor(projectUUID: string) {
    this.stateDir = join(__dirname, '../.state');
    this.stateFile = join(this.stateDir, `${projectUUID}.json`);

    // Ensure state directory exists
    if (!existsSync(this.stateDir)) {
      mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /**
   * Initialize deployment state
   */
  async initialize(projectUUID: string): Promise<DeploymentState> {
    const state: DeploymentState = {
      projectUUID,
      startedAt: new Date().toISOString(),
      completedSteps: [],
      failedSteps: [],
      deployedContracts: {},
      status: 'in-progress',
    };

    await this.save(state);
    Logger.info('Initialized deployment state', { projectUUID });
    return state;
  }

  /**
   * Load existing deployment state
   */
  async load(): Promise<DeploymentState | null> {
    if (!existsSync(this.stateFile)) {
      return null;
    }

    try {
      const content = readFileSync(this.stateFile, 'utf8');
      const state = JSON.parse(content) as DeploymentState;
      Logger.debug('Loaded deployment state', {
        lastCheckpoint: state.lastCheckpoint,
      });
      return state;
    } catch (error) {
      Logger.error('Failed to load deployment state', error);
      return null;
    }
  }

  /**
   * Save deployment state
   */
  async save(state: DeploymentState): Promise<void> {
    try {
      writeFileSync(this.stateFile, JSON.stringify(state, null, 2), 'utf8');
      Logger.debug('Saved deployment state', {
        checkpoint: state.lastCheckpoint,
      });
    } catch (error) {
      Logger.error('Failed to save deployment state', error);
      throw error;
    }
  }

  /**
   * Mark step as complete
   */
  async markStepComplete(stepName: string, data?: any): Promise<void> {
    const state = await this.load();
    if (!state) {
      throw new Error('Deployment state not initialized');
    }

    if (!state.completedSteps.includes(stepName)) {
      state.completedSteps.push(stepName);
    }

    // Remove from failed steps if present
    state.failedSteps = state.failedSteps.filter((s) => s !== stepName);

    if (data) {
      state.metadata = { ...state.metadata, [stepName]: data };
    }

    await this.save(state);
    Logger.info(`Step completed: ${stepName}`);
  }

  /**
   * Mark step as failed
   */
  async markStepFailed(stepName: string, error: Error): Promise<void> {
    const state = await this.load();
    if (!state) {
      throw new Error('Deployment state not initialized');
    }

    if (!state.failedSteps.includes(stepName)) {
      state.failedSteps.push(stepName);
    }

    state.status = 'failed';
    state.metadata = {
      ...state.metadata,
      [`${stepName}_error`]: {
        message: error.message,
        stack: error.stack,
      },
    };

    await this.save(state);
    Logger.error(`Step failed: ${stepName}`, error);
  }

  /**
   * Save checkpoint
   * Also ensures the step is marked as completed if not already
   * IMPORTANT: Do NOT call this if the step failed - check isStepFailed first!
   */
  async saveCheckpoint(stepName: string): Promise<void> {
    const state = await this.load();
    if (!state) {
      throw new Error('Deployment state not initialized');
    }

    // CRITICAL: Don't mark as complete if step is already marked as failed
    if (state.failedSteps.includes(stepName)) {
      throw new Error(
        `Cannot save checkpoint for failed step: ${stepName}. Step must succeed before checkpointing.`
      );
    }

    // Ensure step is marked as completed
    if (!state.completedSteps.includes(stepName)) {
      state.completedSteps.push(stepName);
    }

    // Update checkpoint
    state.lastCheckpoint = stepName;

    // Save state immediately
    await this.save(state);
    Logger.info(`Checkpoint saved: ${stepName}`);
  }

  /**
   * Get resume point
   */
  async getResumePoint(): Promise<string | null> {
    const state = await this.load();
    if (!state) {
      return null;
    }

    return state.lastCheckpoint || null;
  }

  /**
   * Check if step is completed
   */
  async isStepCompleted(stepName: string): Promise<boolean> {
    const state = await this.load();
    if (!state) {
      return false;
    }

    return state.completedSteps.includes(stepName);
  }

  /**
   * Check if step is failed
   */
  async isStepFailed(stepName: string): Promise<boolean> {
    const state = await this.load();
    if (!state) {
      return false;
    }

    return state.failedSteps.includes(stepName);
  }

  /**
   * Add deployed contract to state
   */
  async addDeployedContract(
    contractName: string,
    address: string,
    blockNumber: number
  ): Promise<void> {
    const state = await this.load();
    if (!state) {
      throw new Error('Deployment state not initialized');
    }

    state.deployedContracts[contractName] = { address, blockNumber };
    await this.save(state);
    Logger.info(`Contract deployed: ${contractName}`, { address, blockNumber });
  }

  /**
   * Mark deployment as completed
   */
  async markCompleted(): Promise<void> {
    const state = await this.load();
    if (!state) {
      throw new Error('Deployment state not initialized');
    }

    state.status = 'completed';
    await this.save(state);
    Logger.success('Deployment completed successfully');
  }

  /**
   * Backup deployment state
   */
  async backup(): Promise<string> {
    if (!existsSync(this.stateFile)) {
      throw new Error('No deployment state to backup');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = this.stateFile.replace(
      '.json',
      `-backup-${timestamp}.json`
    );
    copyFileSync(this.stateFile, backupFile);
    Logger.info(`Backup created: ${backupFile}`);
    return backupFile;
  }

  /**
   * Get deployment state summary
   */
  async getSummary(): Promise<string> {
    const state = await this.load();
    if (!state) {
      return 'No deployment state found';
    }

    return `
Deployment State Summary:
  Project UUID: ${state.projectUUID}
  Status: ${state.status}
  Started: ${state.startedAt}
  Last Checkpoint: ${state.lastCheckpoint || 'None'}
  Completed Steps: ${state.completedSteps.length}
  Failed Steps: ${state.failedSteps.length}
  Deployed Contracts: ${Object.keys(state.deployedContracts).length}
`;
  }
}
