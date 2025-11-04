/**
 * Deploy Subgraph Command
 * Handles graph codegen, build, authentication, and deployment
 */
import { execSync } from 'child_process';
import { join } from 'path';
import { Logger } from '../services/_logger';
import { StateManager } from '../services/_state-manager';
import { DeploymentStore } from '../services/_deployment-store';

export interface DeploySubgraphCommandInput {
  projectUUID: string;
}

export class DeploySubgraphCommand {
  private deploymentStore: DeploymentStore;
  private stateManager: StateManager;
  private workspaceRoot: string;

  constructor(stateManager: StateManager) {
    this.deploymentStore = new DeploymentStore();
    this.stateManager = stateManager;
    // Get workspace root (3 levels up from commands directory)
    this.workspaceRoot = join(__dirname, '../../../..');
  }

  /**
   * Execute subgraph deployment
   */
  async execute(command: DeploySubgraphCommandInput): Promise<void> {
    Logger.setStep('deploy-subgraph');
    Logger.info('Starting subgraph deployment');

    // Check if already completed
    const isCompleted = await this.stateManager.isStepCompleted(
      'deploy-subgraph'
    );
    if (isCompleted) {
      Logger.warn('Subgraph already deployed, skipping...');
      return;
    }

    // Check required environment variables
    const subgraphAuthToken = process.env.SUBGRAPH_AUTH_TOKEN;
    const subgraphNetwork = process.env.SUBGRAPH_NETWORK;
    const subgraphName = process.env.SUBGRAPH_NAME;

    if (!subgraphAuthToken || !subgraphNetwork || !subgraphName) {
      Logger.warn(
        'Subgraph configuration missing. Skipping subgraph deployment.'
      );
      Logger.warn('Required: SUBGRAPH_AUTH_TOKEN, SUBGRAPH_NETWORK, SUBGRAPH_NAME');
      return;
    }

    try {
      // Step 1: Generate graph code
      Logger.info('Generating graph code...');
      execSync('pnpm graph:codegen', {
        cwd: this.workspaceRoot,
        stdio: 'inherit',
      });
      Logger.success('Graph code generated');

      // Step 2: Build graph
      Logger.info('Building graph...');
      execSync('pnpm graph:build', {
        cwd: this.workspaceRoot,
        stdio: 'inherit',
      });
      Logger.success('Graph built');

      // Step 3: Authenticate with The Graph Studio
      Logger.info('Authenticating with The Graph Studio...');
      execSync(`npx graph auth --studio "${subgraphAuthToken}"`, {
        cwd: this.workspaceRoot,
        stdio: 'inherit',
      });
      Logger.success('Authenticated with The Graph Studio');

      // Step 4: Deploy subgraph
      Logger.info('Deploying subgraph...');
      const graphDir = join(this.workspaceRoot, 'apps/graph');
      execSync(
        `npx graph deploy --studio --network "${subgraphNetwork}" "${subgraphName}"`,
        {
          cwd: graphDir,
          stdio: 'inherit',
        }
      );
      Logger.success('Subgraph deployed');

      // Step 5: Update deployment file with subgraph URL
      await this.updateSubgraphEndpoint(command.projectUUID, subgraphName);

      await this.stateManager.markStepComplete('deploy-subgraph');
      Logger.success('Subgraph deployment completed successfully');
    } catch (error: any) {
      await this.stateManager.markStepFailed('deploy-subgraph', error);
      throw error;
    } finally {
      Logger.clearStep();
    }
  }

  /**
   * Update deployment file with subgraph URL
   */
  private async updateSubgraphEndpoint(
    projectUUID: string,
    subgraphName: string
  ): Promise<void> {
    Logger.info('Updating deployment file with subgraph URL...');

    // Try to get URL from environment first
    let subgraphUrl = process.env.SUBGRAPH_QUERY_URL;

    // If not in env, try to construct from other variables
    if (!subgraphUrl) {
      const projectId = process.env.SUBGRAPH_PROJECT_ID;
      if (subgraphName && projectId) {
        subgraphUrl = `https://api.studio.thegraph.com/query/${projectId}/${subgraphName}/version/latest`;
      } else {
        Logger.warn(
          'Subgraph URL not found. Please set SUBGRAPH_QUERY_URL or SUBGRAPH_PROJECT_ID'
        );
        return;
      }
    }

    try {
      // Load existing deployment data
      const deploymentData = await this.deploymentStore.load(projectUUID);
      if (!deploymentData) {
        Logger.warn('Deployment file not found, skipping subgraph URL update');
        return;
      }

      // Update with subgraph URL
      deploymentData.subgraphUrl = {
        url: subgraphUrl,
      };

      // Save back to file
      await this.deploymentStore.save(projectUUID, deploymentData);

      Logger.success(`Updated subgraph URL in deployment file: ${subgraphUrl}`);
    } catch (error: any) {
      Logger.warn(`Failed to update subgraph URL: ${error.message}`);
      // Don't throw - this is not critical
    }
  }
}

/**
 * Helper function to deploy subgraph
 */
export async function deploySubgraph(
  command: DeploySubgraphCommandInput,
  stateManager: StateManager
): Promise<void> {
  const cmd = new DeploySubgraphCommand(stateManager);
  return await cmd.execute(command);
}

