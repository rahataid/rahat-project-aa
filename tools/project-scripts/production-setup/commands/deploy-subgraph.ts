/**
 * Deploy Subgraph Command
 * Handles graph codegen, build, authentication, and deployment
 */
import { execSync } from 'child_process';
import { join } from 'path';
import inquirer from 'inquirer';
import { Logger } from '../services/_logger';
import { StateManager } from '../services/_state-manager';
import { DeploymentStore } from '../services/_deployment-store';

export type SubgraphProvider = 'thegraph' | 'alchemy';

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

    // Prompt user to select subgraph provider
    const provider = await this.selectSubgraphProvider();

    Logger.info(`Using subgraph provider: ${provider}`);

    // Validate provider-specific required variables
    const subgraphName = process.env.SUBGRAPH_NAME;
    let missingVars: string[] = [];

    if (provider === 'thegraph') {
      const subgraphAuthToken = process.env.SUBGRAPH_AUTH_TOKEN;
      const subgraphNetwork = process.env.SUBGRAPH_NETWORK;
      if (!subgraphAuthToken) missingVars.push('SUBGRAPH_AUTH_TOKEN');
      if (!subgraphNetwork) missingVars.push('SUBGRAPH_NETWORK');
      if (!subgraphName) missingVars.push('SUBGRAPH_NAME');
    } else if (provider === 'alchemy') {
      const subgraphDeployKey = process.env.SUBGRAPH_DEPLOY_KEY;
      const subgraphVersionLabel = process.env.SUBGRAPH_VERSION_LABEL;
      if (!subgraphDeployKey) missingVars.push('SUBGRAPH_DEPLOY_KEY');
      if (!subgraphVersionLabel) missingVars.push('SUBGRAPH_VERSION_LABEL');
      if (!subgraphName) missingVars.push('SUBGRAPH_NAME');
    }

    if (missingVars.length > 0) {
      const error = new Error(
        `Subgraph configuration missing for ${provider}. Required: ${missingVars.join(
          ', '
        )}`
      );
      Logger.error('Subgraph configuration is required but missing', error);
      await this.stateManager.markStepFailed('deploy-subgraph', error);
      throw error;
    }

    try {
      // Step 1: Generate graph code (common for both providers)
      Logger.info('Generating graph code...');
      execSync('pnpm graph:codegen', {
        cwd: this.workspaceRoot,
        stdio: 'inherit',
      });
      Logger.success('Graph code generated');

      // Step 2: Build graph (common for both providers)
      Logger.info('Building graph...');
      execSync('pnpm graph:build', {
        cwd: this.workspaceRoot,
        stdio: 'inherit',
      });
      Logger.success('Graph built');

      // Step 3: Provider-specific authentication and deployment
      if (provider === 'thegraph') {
        await this.deployToTheGraph(subgraphName!);
      } else if (provider === 'alchemy') {
        await this.deployToAlchemy(subgraphName!);
      }

      // Step 4: Update deployment file with subgraph URL
      await this.updateSubgraphEndpoint(
        command.projectUUID,
        subgraphName!,
        provider
      );

      await this.stateManager.markStepComplete('deploy-subgraph', {
        provider,
      });
      Logger.success('Subgraph deployment completed successfully');
    } catch (error: any) {
      await this.stateManager.markStepFailed('deploy-subgraph', error);
      throw error;
    } finally {
      Logger.clearStep();
    }
  }

  /**
   * Prompt user to select subgraph provider
   */
  private async selectSubgraphProvider(): Promise<SubgraphProvider> {
    // Check if provider is already set in state (from previous run)
    const state = await this.stateManager.load();
    const previousProvider = state?.metadata?.['deploy-subgraph']?.provider as
      | SubgraphProvider
      | undefined;

    if (
      previousProvider &&
      (previousProvider === 'thegraph' || previousProvider === 'alchemy')
    ) {
      Logger.info(`Using previously selected provider: ${previousProvider}`);
      return previousProvider;
    }

    // Prompt user for selection
    const { provider } = await inquirer.prompt([
      {
        type: 'list',
        name: 'provider',
        message: 'Select subgraph deployment provider:',
        choices: [
          {
            name: 'The Graph Studio',
            value: 'thegraph',
            short: 'The Graph',
          },
          {
            name: 'Alchemy',
            value: 'alchemy',
            short: 'Alchemy',
          },
        ],
        default: 'thegraph',
      },
    ]);

    return provider as SubgraphProvider;
  }

  /**
   * Deploy to The Graph Studio
   */
  private async deployToTheGraph(subgraphName: string): Promise<void> {
    const subgraphAuthToken = process.env.SUBGRAPH_AUTH_TOKEN!;
    const subgraphNetwork = process.env.SUBGRAPH_NETWORK!;

    // Authenticate with The Graph Studio
    Logger.info('Authenticating with The Graph Studio...');
    execSync(`npx graph auth --studio "${subgraphAuthToken}"`, {
      cwd: this.workspaceRoot,
      stdio: 'inherit',
    });
    Logger.success('Authenticated with The Graph Studio');

    // Deploy subgraph
    Logger.info('Deploying subgraph to The Graph Studio...');
    const graphDir = join(this.workspaceRoot, 'apps/graph');
    execSync(
      `npx graph deploy --studio --network "${subgraphNetwork}" "${subgraphName}"`,
      {
        cwd: graphDir,
        stdio: 'inherit',
      }
    );
    Logger.success('Subgraph deployed to The Graph Studio');
  }

  /**
   * Deploy to Alchemy
   */
  private async deployToAlchemy(subgraphName: string): Promise<void> {
    const subgraphDeployKey = process.env.SUBGRAPH_DEPLOY_KEY!;
    const subgraphVersionLabel = process.env.SUBGRAPH_VERSION_LABEL!;

    // Alchemy deployment endpoints
    const alchemyNode = 'https://subgraphs.alchemy.com/api/subgraphs/deploy';
    const alchemyIpfs = 'https://ipfs.satsuma.xyz';

    // Deploy subgraph to Alchemy (no separate auth step)
    Logger.info('Deploying subgraph to Alchemy...');
    const graphDir = join(this.workspaceRoot, 'apps/graph');
    execSync(
      `npx graph deploy "${subgraphName}" --version-label "${subgraphVersionLabel}" --node "${alchemyNode}" --deploy-key "${subgraphDeployKey}" --ipfs "${alchemyIpfs}"`,
      {
        cwd: graphDir,
        stdio: 'inherit',
      }
    );
    Logger.success('Subgraph deployed to Alchemy');
  }

  /**
   * Update deployment file with subgraph URL
   */
  private async updateSubgraphEndpoint(
    projectUUID: string,
    subgraphName: string,
    provider: SubgraphProvider
  ): Promise<void> {
    Logger.info('Updating deployment file with subgraph URL...');

    // Try to get URL from environment first
    let subgraphUrl = process.env.SUBGRAPH_QUERY_URL;

    // If not in env, construct based on provider
    if (!subgraphUrl) {
      if (provider === 'thegraph') {
        const projectId = process.env.SUBGRAPH_PROJECT_ID;
        if (subgraphName && projectId) {
          subgraphUrl = `https://api.studio.thegraph.com/query/${projectId}/${subgraphName}/version/latest`;
        } else {
          Logger.warn(
            'The Graph URL not found. Please set SUBGRAPH_QUERY_URL or SUBGRAPH_PROJECT_ID'
          );
          return;
        }
      } else if (provider === 'alchemy') {
        // Alchemy subgraph URL format (may vary, check Alchemy docs)
        // Common format: https://<subgraph-name>.gateway.alchemy.com
        // Or: https://subgraphs.alchemy.com/api/subgraphs/name/<subgraph-name>
        const alchemyApiKey = process.env.ALCHEMY_API_KEY;
        if (alchemyApiKey) {
          // Try to construct Alchemy URL
          subgraphUrl = `https://${subgraphName}.gateway.alchemy.com`;
        } else {
          Logger.warn(
            'Alchemy subgraph URL not found. Please set SUBGRAPH_QUERY_URL or ALCHEMY_API_KEY'
          );
          return;
        }
      }
    }

    try {
      // Load existing deployment data
      const deploymentData = await this.deploymentStore.load(projectUUID);
      if (!deploymentData) {
        Logger.warn('Deployment file not found, skipping subgraph URL update');
        return;
      }

      // Only update if we have a URL
      if (subgraphUrl) {
        // Update with subgraph URL
        deploymentData.subgraphUrl = {
          url: subgraphUrl,
        };

        // Save back to file
        await this.deploymentStore.save(projectUUID, deploymentData);

        Logger.success(
          `Updated subgraph URL in deployment file: ${subgraphUrl}`
        );
      }
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
