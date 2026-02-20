/**
 * Subgraph URL Service
 * Handles subgraph URL construction and deployment file updates
 */
import { Logger } from './_logger';
import { DeploymentStore } from './_deployment-store';
import { SubgraphProvider } from './_subgraph-config';

export class SubgraphUrlService {
  constructor(private deploymentStore: DeploymentStore) {}

  /**
   * Construct subgraph URL based on provider
   */
  constructUrl(
    provider: SubgraphProvider,
    subgraphName: string
  ): string | null {
    // Try to get URL from environment first
    const subgraphUrl = process.env.SUBGRAPH_QUERY_URL;
    if (subgraphUrl) {
      return subgraphUrl;
    }

    // Construct based on provider
    if (provider === 'thegraph') {
      const projectId = process.env.SUBGRAPH_PROJECT_ID;
      if (subgraphName && projectId) {
        return `https://api.studio.thegraph.com/query/${projectId}/${subgraphName}/version/latest`;
      }
      Logger.warn(
        'The Graph URL not found. Please set SUBGRAPH_QUERY_URL or SUBGRAPH_PROJECT_ID'
      );
      return null;
    } else if (provider === 'alchemy') {
      const alchemyApiKey = process.env.ALCHEMY_API_KEY;
      if (alchemyApiKey) {
        // Try to construct Alchemy URL
        return `https://${subgraphName}.gateway.alchemy.com`;
      }
      Logger.warn(
        'Alchemy subgraph URL not found. Please set SUBGRAPH_QUERY_URL or ALCHEMY_API_KEY'
      );
      return null;
    }

    return null;
  }

  /**
   * Update deployment file with subgraph URL
   * Throws an error if subgraph URL cannot be obtained or saved
   */
  async updateDeploymentFile(
    projectUUID: string,
    subgraphName: string,
    provider: SubgraphProvider
  ): Promise<void> {
    Logger.info('Updating deployment file with subgraph URL...');

    const subgraphUrl = this.constructUrl(provider, subgraphName);
    if (!subgraphUrl) {
      const errorMsg = `Subgraph URL not available. Please set SUBGRAPH_QUERY_URL or the required provider-specific environment variables (SUBGRAPH_PROJECT_ID for The Graph, ALCHEMY_API_KEY for Alchemy).`;
      Logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      // Load existing deployment data
      const deploymentData = await this.deploymentStore.load(projectUUID);
      if (!deploymentData) {
        const errorMsg =
          'Deployment file not found, cannot update subgraph URL';
        Logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Update with subgraph URL
      deploymentData.subgraphUrl = {
        url: subgraphUrl,
      };

      // Save back to file
      await this.deploymentStore.save(projectUUID, deploymentData);

      // Verify the URL was actually saved
      const savedData = await this.deploymentStore.load(projectUUID);
      const savedUrl = savedData?.subgraphUrl
        ? typeof savedData.subgraphUrl === 'string'
          ? savedData.subgraphUrl
          : savedData.subgraphUrl.url
        : null;

      if (!savedUrl || savedUrl !== subgraphUrl) {
        const errorMsg = `Failed to verify subgraph URL was saved to deployment file`;
        Logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      Logger.success(`Updated subgraph URL in deployment file: ${subgraphUrl}`);
    } catch (error: any) {
      // Re-throw the error - this is critical
      Logger.error(`Failed to update subgraph URL: ${error.message}`);
      throw error;
    }
  }
}
