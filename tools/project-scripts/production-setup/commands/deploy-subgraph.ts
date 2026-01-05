/**
 * Deploy Subgraph Command
 * Orchestrates subgraph deployment process
 */
import { Logger } from '../services/_logger';
import { StateManager } from '../services/_state-manager';
import {
  SubgraphConfigService,
  SubgraphProvider,
} from '../services/_subgraph-config';
import { GraphBuilderService } from '../services/_graph-builder';
import {
  SubgraphDeployerFactory,
  SubgraphDeployer,
} from '../services/_subgraph-deployers';
import { SubgraphUrlService } from '../services/_subgraph-url';
import { DeploymentStore } from '../services/_deployment-store';

export type { SubgraphProvider } from '../services/_subgraph-config';

export interface DeploySubgraphCommandInput {
  projectUUID: string;
}

export class DeploySubgraphCommand {
  private configService: SubgraphConfigService;
  private builderService: GraphBuilderService;
  private urlService: SubgraphUrlService;
  private stateManager: StateManager;

  constructor(stateManager: StateManager) {
    this.stateManager = stateManager;
    this.configService = new SubgraphConfigService(stateManager);
    this.builderService = new GraphBuilderService();
    this.urlService = new SubgraphUrlService(new DeploymentStore());
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

    try {
      // Step 1: Select provider
      const provider = await this.configService.selectProvider();
      Logger.info(`Using subgraph provider: ${provider}`);

      // Step 2: Get configuration, build, and deploy
      let subgraphName: string;
      if (provider === 'thegraph') {
        const config = await this.configService.getTheGraphConfig();
        subgraphName = config.name;
        await this.builderService.buildAll();
        const deployer = SubgraphDeployerFactory.create(provider);
        Logger.debug('About to call deployer.deploy()...');
        try {
          await deployer.deploy(config); // This will throw if deployment fails
          Logger.debug('deployer.deploy() completed without throwing');
        } catch (deployError: any) {
          Logger.error('deployer.deploy() threw an error', {
            message: deployError?.message,
            stack: deployError?.stack,
          });
          // Re-throw immediately - do NOT continue to success logging
          throw deployError;
        }
      } else {
        const config = await this.configService.getAlchemyConfig();
        subgraphName = config.name;
        await this.builderService.buildAll();
        const deployer = SubgraphDeployerFactory.create(provider);
        Logger.debug('About to call deployer.deploy()...');
        try {
          await deployer.deploy(config); // This will throw if deployment fails
          Logger.debug('deployer.deploy() completed without throwing');
        } catch (deployError: any) {
          Logger.error('deployer.deploy() threw an error', {
            message: deployError?.message,
            stack: deployError?.stack,
          });
          // Re-throw immediately - do NOT continue to success logging
          throw deployError;
        }
      }

      // Only proceed if deployment succeeded (no exception thrown)
      Logger.debug(
        'Deployment succeeded, proceeding to update deployment file...'
      );

      // Step 3: Update deployment file with subgraph URL (only if deploy succeeded)
      // This will throw an error if subgraph URL cannot be obtained or saved
      await this.urlService.updateDeploymentFile(
        command.projectUUID,
        subgraphName,
        provider
      );

      // Verify subgraph URL was successfully saved
      const deploymentStore = new DeploymentStore();
      const deploymentData = await deploymentStore.load(command.projectUUID);
      const savedSubgraphUrl = deploymentData?.subgraphUrl
        ? typeof deploymentData.subgraphUrl === 'string'
          ? deploymentData.subgraphUrl
          : deploymentData.subgraphUrl.url
        : null;

      if (!savedSubgraphUrl) {
        const errorMsg =
          'Subgraph deployment succeeded but subgraph URL was not saved to deployment file';
        Logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      Logger.debug('About to mark step as complete...');
      // Only mark as complete if we reach here (deployment succeeded AND URL was saved)
      await this.stateManager.markStepComplete('deploy-subgraph', {
        provider,
        subgraphUrl: savedSubgraphUrl,
      });
      Logger.success('Subgraph deployment completed successfully');
    } catch (error: any) {
      // Deployment failed - mark as failed and re-throw
      // DO NOT log success messages here
      Logger.error('Subgraph deployment failed - entering catch block', {
        message: error?.message,
        stack: error?.stack,
      });
      await this.stateManager.markStepFailed('deploy-subgraph', error);
      Logger.error('Subgraph deployment failed', error);
      // Re-throw to stop the pipeline - this prevents database update
      throw error;
    } finally {
      Logger.clearStep();
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
