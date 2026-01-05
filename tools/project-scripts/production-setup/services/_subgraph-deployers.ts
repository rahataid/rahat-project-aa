/**
 * Subgraph Deployers
 * Provider-specific deployment implementations
 */
import { execSync, spawnSync } from 'child_process';
import { join } from 'path';
import { Logger } from './_logger';
import {
  SubgraphProvider,
  TheGraphConfig,
  AlchemyConfig,
} from './_subgraph-config';

export interface SubgraphDeployer {
  deploy(config: TheGraphConfig | AlchemyConfig): Promise<void>;
}

/**
 * The Graph Studio Deployer
 */
export class TheGraphDeployer implements SubgraphDeployer {
  private workspaceRoot: string;
  private graphDir: string;

  constructor() {
    this.workspaceRoot = join(__dirname, '../../../..');
    this.graphDir = join(this.workspaceRoot, 'apps/graph');
  }

  async deploy(config: TheGraphConfig): Promise<void> {
    const { name, network, authToken } = config;

    try {
      // Authenticate with The Graph Studio
      // Run from graph directory where @graphprotocol/graph-cli is installed
      Logger.info('Authenticating with The Graph Studio...');
      execSync(
        `npx --yes @graphprotocol/graph-cli auth --studio "${authToken}"`,
        {
          cwd: this.graphDir,
          stdio: 'inherit',
        }
      );
      Logger.success('Authenticated with The Graph Studio');
    } catch (error: any) {
      Logger.error('Failed to authenticate with The Graph Studio', error);
      throw new Error(
        `Graph authentication failed: ${error.message || 'Unknown error'}`
      );
    }

    try {
      // Deploy subgraph
      Logger.info('Deploying subgraph to The Graph Studio...');
      Logger.info('Executing graph deploy command...');

      // Use spawnSync for better control over stdio and exit codes
      const result = spawnSync(
        'npx',
        [
          '--yes',
          '@graphprotocol/graph-cli',
          'deploy',
          '--studio',
          '--network',
          network,
          name,
        ],
        {
          cwd: this.graphDir,
          stdio: 'inherit', // Keep inherit for interactive prompts
          shell: false,
        }
      );

      // Check exit code explicitly - this is critical
      if (result.status !== 0) {
        const exitCode = result.status ?? 1;
        const errorMsg = result.signal
          ? `Subgraph deployment failed: Process killed by signal ${result.signal}`
          : `Subgraph deployment failed (exit code ${exitCode}): Deploy key not found or invalid`;

        Logger.error('Graph deploy command failed', {
          exitCode,
          signal: result.signal,
          error: errorMsg,
        });
        throw new Error(errorMsg);
      }

      // Only log success if we reach here (exit code was 0)
      Logger.success('Subgraph deployed to The Graph Studio');
    } catch (error: any) {
      // Re-throw the error to stop the pipeline - do NOT log success
      Logger.error('Failed to deploy subgraph to The Graph Studio', {
        message: error?.message,
        stack: error?.stack,
      });
      throw error;
    }
  }
}

/**
 * Alchemy Deployer
 */
export class AlchemyDeployer implements SubgraphDeployer {
  private workspaceRoot: string;
  private graphDir: string;
  private readonly alchemyNode =
    'https://subgraphs.alchemy.com/api/subgraphs/deploy';
  private readonly alchemyIpfs = 'https://ipfs.satsuma.xyz';

  constructor() {
    this.workspaceRoot = join(__dirname, '../../../..');
    this.graphDir = join(this.workspaceRoot, 'apps/graph');
  }

  async deploy(config: AlchemyConfig): Promise<void> {
    const { name, deployKey, versionLabel } = config;

    try {
      // Deploy subgraph to Alchemy (no separate auth step)
      // Run from graph directory where @graphprotocol/graph-cli is installed
      Logger.info('Deploying subgraph to Alchemy...');
      execSync(
        `npx --yes @graphprotocol/graph-cli deploy "${name}" --version-label "${versionLabel}" --node "${this.alchemyNode}" --deploy-key "${deployKey}" --ipfs "${this.alchemyIpfs}"`,
        {
          cwd: this.graphDir,
          stdio: 'inherit',
        }
      );
      Logger.success('Subgraph deployed to Alchemy');
    } catch (error: any) {
      Logger.error('Failed to deploy subgraph to Alchemy', error);
      throw new Error(`Subgraph deployment failed: ${error.message}`);
    }
  }
}

/**
 * Deployer Factory
 */
export class SubgraphDeployerFactory {
  static create(provider: SubgraphProvider): SubgraphDeployer {
    switch (provider) {
      case 'thegraph':
        return new TheGraphDeployer();
      case 'alchemy':
        return new AlchemyDeployer();
      default:
        throw new Error(`Unknown subgraph provider: ${provider}`);
    }
  }
}
