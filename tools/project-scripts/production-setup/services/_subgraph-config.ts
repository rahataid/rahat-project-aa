/**
 * Subgraph Configuration Service
 * Handles provider selection and configuration gathering (env vars, prompts, state)
 */
import inquirer from 'inquirer';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { Logger } from './_logger';
import { StateManager } from './_state-manager';

export type SubgraphProvider = 'thegraph' | 'alchemy';

export interface TheGraphConfig {
  name: string;
  network: string;
  authToken: string;
}

export interface AlchemyConfig {
  name: string;
  deployKey: string;
  versionLabel: string;
}

export class SubgraphConfigService {
  constructor(private stateManager: StateManager) {}

  /**
   * Get available networks from networks.json
   */
  private getAvailableNetworks(): string[] {
    try {
      // Path from services/ directory: services -> production-setup -> project-scripts -> tools -> rahat-project-aa -> apps/graph
      const networksPath = join(
        __dirname,
        '../../../../apps/graph/networks.json'
      );

      if (!existsSync(networksPath)) {
        Logger.warn(
          `networks.json not found at ${networksPath}, falling back to default networks`
        );
        return ['arbitrum-sepolia', 'base-sepolia', 'mainnet'];
      }

      const networksData = readFileSync(networksPath, 'utf8');
      const networks = JSON.parse(networksData);
      const networkKeys = Object.keys(networks);

      if (networkKeys.length === 0) {
        Logger.warn('networks.json is empty, falling back to default networks');
        return ['arbitrum-sepolia', 'base-sepolia', 'mainnet'];
      }

      return networkKeys;
    } catch (error: any) {
      Logger.warn(
        `Failed to read networks.json: ${error.message}, falling back to default networks`
      );
      return ['arbitrum-sepolia', 'base-sepolia', 'mainnet'];
    }
  }

  /**
   * Select subgraph provider (from state or prompt)
   */
  async selectProvider(): Promise<SubgraphProvider> {
    // Check if provider is already set in state
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
   * Get The Graph configuration
   */
  async getTheGraphConfig(): Promise<TheGraphConfig> {
    // Check state first
    const state = await this.stateManager.load();
    const savedConfig = state?.metadata?.['deploy-subgraph-config']?.config;
    if (
      savedConfig &&
      savedConfig.provider === 'thegraph' &&
      savedConfig.name &&
      savedConfig.network &&
      savedConfig.authToken
    ) {
      Logger.info('Using saved subgraph configuration');
      return {
        name: savedConfig.name,
        network: savedConfig.network,
        authToken: savedConfig.authToken,
      };
    }

    // Try environment variables first
    let subgraphName = process.env.SUBGRAPH_NAME;
    let subgraphNetwork = process.env.SUBGRAPH_NETWORK;
    let subgraphAuthToken = process.env.SUBGRAPH_AUTH_TOKEN;

    // Prompt for missing values
    const prompts: any[] = [];

    if (!subgraphName) {
      prompts.push({
        type: 'input',
        name: 'subgraphName',
        message: 'Enter subgraph name (e.g., rahat-aa-stage):',
        validate: (input: string) =>
          input.trim().length > 0 || 'Subgraph name is required',
      });
    }

    if (!subgraphNetwork) {
      const availableNetworks = this.getAvailableNetworks();
      prompts.push({
        type: 'list',
        name: 'subgraphNetwork',
        message: 'Select network name:',
        choices: availableNetworks.map((network) => ({
          name: network,
          value: network,
        })),
        default:
          availableNetworks.find((n) => n.includes('sepolia')) ||
          availableNetworks[0],
      });
    }

    if (!subgraphAuthToken) {
      prompts.push({
        type: 'password',
        name: 'subgraphAuthToken',
        message: 'Enter The Graph Studio deploy key:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Deploy key is required',
      });
    }

    if (prompts.length > 0) {
      const answers = await inquirer.prompt(prompts);
      subgraphName = subgraphName || answers.subgraphName;
      subgraphNetwork = subgraphNetwork || answers.subgraphNetwork;
      subgraphAuthToken = subgraphAuthToken || answers.subgraphAuthToken;
    }

    if (!subgraphName || !subgraphNetwork || !subgraphAuthToken) {
      throw new Error(
        'Subgraph configuration incomplete. Required: SUBGRAPH_NAME, SUBGRAPH_NETWORK, SUBGRAPH_AUTH_TOKEN'
      );
    }

    const config = {
      name: subgraphName.trim(),
      network: subgraphNetwork.trim(),
      authToken: subgraphAuthToken.trim(),
    };

    // Save config to state
    await this.stateManager.markStepComplete('deploy-subgraph-config', {
      provider: 'thegraph',
      config,
    });

    return config;
  }

  /**
   * Get Alchemy configuration
   */
  async getAlchemyConfig(): Promise<AlchemyConfig> {
    // Check state first
    const state = await this.stateManager.load();
    const savedConfig = state?.metadata?.['deploy-subgraph-config']?.config;
    if (
      savedConfig &&
      savedConfig.provider === 'alchemy' &&
      savedConfig.name &&
      savedConfig.deployKey &&
      savedConfig.versionLabel
    ) {
      Logger.info('Using saved subgraph configuration');
      return {
        name: savedConfig.name,
        deployKey: savedConfig.deployKey,
        versionLabel: savedConfig.versionLabel,
      };
    }

    // Try environment variables first
    let subgraphName = process.env.SUBGRAPH_NAME;
    let subgraphDeployKey = process.env.SUBGRAPH_DEPLOY_KEY;
    let subgraphVersionLabel = process.env.SUBGRAPH_VERSION_LABEL;

    // Prompt for missing values
    const prompts: any[] = [];

    if (!subgraphName) {
      prompts.push({
        type: 'input',
        name: 'subgraphName',
        message: 'Enter subgraph name:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Subgraph name is required',
      });
    }

    if (!subgraphDeployKey) {
      prompts.push({
        type: 'password',
        name: 'subgraphDeployKey',
        message: 'Enter Alchemy deploy key:',
        validate: (input: string) =>
          input.trim().length > 0 || 'Deploy key is required',
      });
    }

    if (!subgraphVersionLabel) {
      prompts.push({
        type: 'input',
        name: 'subgraphVersionLabel',
        message: 'Enter version label (e.g., v1.0.0):',
        validate: (input: string) =>
          input.trim().length > 0 || 'Version label is required',
      });
    }

    if (prompts.length > 0) {
      const answers = await inquirer.prompt(prompts);
      subgraphName = subgraphName || answers.subgraphName;
      subgraphDeployKey = subgraphDeployKey || answers.subgraphDeployKey;
      subgraphVersionLabel =
        subgraphVersionLabel || answers.subgraphVersionLabel;
    }

    if (!subgraphName || !subgraphDeployKey || !subgraphVersionLabel) {
      throw new Error(
        'Subgraph configuration incomplete. Required: SUBGRAPH_NAME, SUBGRAPH_DEPLOY_KEY, SUBGRAPH_VERSION_LABEL'
      );
    }

    const config = {
      name: subgraphName.trim(),
      deployKey: subgraphDeployKey.trim(),
      versionLabel: subgraphVersionLabel.trim(),
    };

    // Save config to state
    await this.stateManager.markStepComplete('deploy-subgraph-config', {
      provider: 'alchemy',
      config,
    });

    return config;
  }
}
