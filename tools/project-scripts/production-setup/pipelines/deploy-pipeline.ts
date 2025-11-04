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

// Load environment variables
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config();

export interface PipelineStep {
  name: string;
  description: string;
  command: () => Promise<void>;
  checkpoint: boolean; // Can resume from here
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

      try {
        await step.command();

        // Save checkpoint if configured
        if (step.checkpoint) {
          await this.stateManager.saveCheckpoint(step.name);
        }

        Logger.success(`Step '${step.name}' completed`);
      } catch (error: any) {
        Logger.error(`Step '${step.name}' failed`, error);
        await this.stateManager.markStepFailed(step.name, error);
        throw error;
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
