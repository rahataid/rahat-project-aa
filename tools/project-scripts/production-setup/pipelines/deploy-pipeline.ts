/**
 * Deployment Pipeline
 * Orchestrates the entire deployment process with state tracking and resumability
 */
import * as dotenv from 'dotenv';
import { Logger } from '../services/_logger';
import { StateManager } from '../services/_state-manager';
import { deployAllContracts } from '../commands/deploy-contracts';
import {
  configurePermissions,
  ConfigurePermissionsCommandInput,
} from '../commands/configure-permissions';
import {
  saveDeploymentState,
  SaveDeploymentStateCommandInput,
} from '../commands/save-deployment-state';
import {
  configureGraphNetworks,
  ConfigureGraphNetworksCommandInput,
} from '../commands/configure-graph-networks';
import {
  deploySubgraph,
  DeploySubgraphCommandInput,
} from '../commands/deploy-subgraph';

// Load environment variables
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config();

export interface PipelineStep {
  name: string;
  description: string;
  command: () => Promise<void>;
  checkpoint: boolean; // Can resume from here
  required: boolean; // If false, step can be skipped on error (default: true)
}

export class DeploymentPipeline {
  private projectUUID: string;
  private stateManager: StateManager;
  private pipeline: PipelineStep[];

  constructor(projectUUID: string) {
    this.projectUUID = projectUUID;
    this.stateManager = new StateManager(projectUUID);
    this.pipeline = [];
  }

  /**
   * Build the deployment pipeline
   */
  private buildPipeline(): PipelineStep[] {
    return [
      {
        name: 'deploy-contracts',
        description: 'Deploy all contracts',
        checkpoint: true,
        required: true, // CRITICAL: Cannot skip
        command: async () => {
          const result = await deployAllContracts(
            this.projectUUID,
            this.stateManager
          );
          // Store result for next steps
          await this.stateManager.markStepComplete('deploy-contracts', {
            result,
          });
        },
      },
      {
        name: 'configure-permissions',
        description: 'Configure contract permissions',
        checkpoint: true,
        required: true, // CRITICAL: Cannot skip (registerProject is essential)
        command: async () => {
          const state = await this.stateManager.load();
          if (!state?.metadata?.['deploy-contracts']) {
            throw new Error('Contract deployment data not found in state');
          }

          const deployedContracts = state.metadata['deploy-contracts'].result;
          const configCmd: ConfigurePermissionsCommandInput = {
            projectUUID: this.projectUUID,
            deployedContracts,
          };
          await configurePermissions(configCmd, this.stateManager);
        },
      },
      {
        name: 'save-deployment-state',
        description: 'Save deployment state to file',
        checkpoint: true,
        required: true, // CRITICAL: Cannot skip (needed for graph and DB updates)
        command: async () => {
          const state = await this.stateManager.load();
          if (!state?.metadata?.['deploy-contracts']) {
            throw new Error('Contract deployment data not found in state');
          }

          const deployedContracts = state.metadata['deploy-contracts'].result;
          const saveCmd: SaveDeploymentStateCommandInput = {
            projectUUID: this.projectUUID,
            deployedContracts,
          };
          await saveDeploymentState(saveCmd, this.stateManager);
        },
      },
      {
        name: 'configure-graph-networks',
        description: 'Configure graph networks.json',
        checkpoint: true,
        required: true, // CRITICAL: Required for subgraph deployment
        command: async () => {
          const configCmd: ConfigureGraphNetworksCommandInput = {
            projectUUID: this.projectUUID,
          };
          await configureGraphNetworks(configCmd, this.stateManager);
        },
      },
      {
        name: 'deploy-subgraph',
        description: 'Deploy subgraph to The Graph',
        checkpoint: true,
        required: true, // CRITICAL: Subgraph is compulsory
        command: async () => {
          const deployCmd: DeploySubgraphCommandInput = {
            projectUUID: this.projectUUID,
          };
          await deploySubgraph(deployCmd, this.stateManager);
        },
      },
    ];
  }

  /**
   * Execute the pipeline
   */
  async execute(resumeFrom?: string): Promise<void> {
    Logger.info('Starting deployment pipeline', {
      projectUUID: this.projectUUID,
      resumeFrom: resumeFrom || 'start',
    });

    // Initialize or load state
    let state = await this.stateManager.load();
    if (!state) {
      state = await this.stateManager.initialize(this.projectUUID);
    }

    // Build pipeline
    this.pipeline = this.buildPipeline();

    // Determine start index
    let startIndex = 0;
    if (resumeFrom) {
      const stepIndex = this.pipeline.findIndex((s) => s.name === resumeFrom);
      if (stepIndex >= 0) {
        startIndex = stepIndex;
        Logger.info(`Resuming from step: ${resumeFrom}`);
      } else {
        Logger.warn(
          `Resume point '${resumeFrom}' not found, starting from beginning`
        );
      }
    } else {
      // Try to resume from last checkpoint
      const lastCheckpoint = await this.stateManager.getResumePoint();
      if (lastCheckpoint) {
        const stepIndex = this.pipeline.findIndex(
          (s) => s.name === lastCheckpoint
        );
        if (stepIndex >= 0) {
          startIndex = stepIndex;
          Logger.info(`Resuming from last checkpoint: ${lastCheckpoint}`);
        }
      }
    }

    // Execute pipeline steps
    for (let i = startIndex; i < this.pipeline.length; i++) {
      const step = this.pipeline[i];

      // Skip if already completed
      const isCompleted = await this.stateManager.isStepCompleted(step.name);
      if (isCompleted && !resumeFrom) {
        Logger.info(`Step '${step.name}' already completed, skipping...`);
        continue;
      }

      Logger.info(`[${i + 1}/${this.pipeline.length}] ${step.description}`);
      const isRequired = step.required !== false; // Default to true if not specified

      try {
        await step.command();

        // Save checkpoint if configured (this ensures step is marked complete and state is saved)
        if (step.checkpoint) {
          await this.stateManager.saveCheckpoint(step.name);
        } else {
          // Even if not a checkpoint, ensure step completion is saved
          const isStepComplete = await this.stateManager.isStepCompleted(
            step.name
          );
          if (!isStepComplete) {
            // If command didn't mark as complete, do it here
            await this.stateManager.markStepComplete(step.name);
          }
        }

        Logger.success(`Step '${step.name}' completed`);
      } catch (error: any) {
        Logger.error(`Step '${step.name}' failed`, error);
        // Ensure failure is saved to state
        await this.stateManager.markStepFailed(step.name, error);

        if (isRequired) {
          // Required step failed - stop pipeline
          Logger.error(
            `❌ CRITICAL STEP FAILED: '${step.name}' is required and cannot be skipped`
          );
          throw error;
        } else {
          // Optional step failed - log warning and continue
          Logger.warn(
            `⚠️  Optional step '${step.name}' failed but continuing...`
          );
          Logger.warn(`Error: ${error.message}`);
          // Mark as skipped instead of failed
          await this.stateManager.markStepComplete(step.name, {
            skipped: true,
            reason: error.message,
          });
        }
      }
    }

    // Mark deployment as completed
    await this.stateManager.markCompleted();
    Logger.success('Deployment pipeline completed successfully');
  }

  /**
   * Get pipeline status
   */
  async getStatus(): Promise<string> {
    return await this.stateManager.getSummary();
  }
}

/**
 * Main execution function
 */
async function main() {
  const projectUUID = process.env.PROJECT_UUID;
  const resumeFrom = process.argv[2] || undefined;

  if (!projectUUID) {
    Logger.error('PROJECT_UUID environment variable is required');
    process.exit(1);
  }

  try {
    const pipeline = new DeploymentPipeline(projectUUID);

    // Show status if requested
    if (process.argv.includes('--status')) {
      const status = await pipeline.getStatus();
      console.log(status);
      process.exit(0);
    }

    // Execute pipeline
    await pipeline.execute(resumeFrom);
    process.exit(0);
  } catch (error: any) {
    Logger.error('Deployment pipeline failed', error);
    console.log('\n💡 Tip: You can resume from the last checkpoint:');
    console.log(
      `   npx ts-node pipelines/deploy-pipeline.ts <checkpoint-name>`
    );
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}
