import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';
import { existsSync } from 'fs';
// Load environment variables from .env.setup if it exists, otherwise fallback to .env
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config(); // Fallback to default .env

interface DeploymentFile {
  CONTRACTS: Record<string, { address: string; startBlock: number }>;
  deployedAt?: string;
  network?: string;
  chainSettings?: any;
  subgraphUrl?: string | { url: string };
}

/**
 * Updates the deployment file with subgraph endpoint URL
 */
async function updateSubgraphEndpoint(
  projectUUID: string,
  subgraphUrl: string
): Promise<void> {
  const deploymentFilePath = `${__dirname}/deployments/${projectUUID}.json`;

  if (!existsSync(deploymentFilePath)) {
    throw new Error(`Deployment file not found: ${deploymentFilePath}`);
  }

  try {
    const fileData = await fs.readFile(deploymentFilePath, 'utf8');
    const deployment: DeploymentFile = JSON.parse(fileData);

    // Update subgraph URL
    deployment.subgraphUrl = {
      url: subgraphUrl,
    };

    // Write back to file
    await fs.writeFile(
      deploymentFilePath,
      JSON.stringify(deployment, null, 2),
      'utf-8'
    );

    console.log(`✅ Updated subgraph URL in deployment file: ${deploymentFilePath}`);
    console.log(`   Subgraph URL: ${subgraphUrl}`);
  } catch (error: any) {
    console.error(`❌ Error updating subgraph endpoint:`, error.message);
    throw error;
  }
}

/**
 * Constructs subgraph URL from environment variables or prompts user
 */
function getSubgraphUrl(): string {
  // Try to get from environment variable first
  let subgraphUrl = process.env.SUBGRAPH_QUERY_URL;

  if (subgraphUrl && subgraphUrl.trim() !== '') {
    return subgraphUrl.trim();
  }

  // If not in env, try to construct from other variables
  const subgraphName = process.env.SUBGRAPH_NAME;
  const projectId = process.env.SUBGRAPH_PROJECT_ID;

  if (subgraphName && projectId) {
    // Construct URL: https://api.studio.thegraph.com/query/<project_id>/<subgraph_name>/version/latest
    return `https://api.studio.thegraph.com/query/${projectId}/${subgraphName}/version/latest`;
  }

  // If still not available, prompt would be needed, but for automation we'll throw
  throw new Error(
    'Subgraph URL not found. Please set SUBGRAPH_QUERY_URL or provide SUBGRAPH_NAME and SUBGRAPH_PROJECT_ID'
  );
}

async function main() {
  const projectUUID = process.env.PROJECT_UUID;

  if (!projectUUID) {
    console.error('❌ PROJECT_UUID environment variable is required');
    process.exit(1);
  }

  try {
    const subgraphUrl = getSubgraphUrl();
    await updateSubgraphEndpoint(projectUUID, subgraphUrl);
    console.log('\n✅ Subgraph endpoint update completed successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Failed to update subgraph endpoint:', error.message);
    console.log('\n💡 Tip: You can manually update the deployment file by adding:');
    console.log('   "subgraphUrl": { "url": "https://api.studio.thegraph.com/query/..." }');
    console.log('\n   Or set SUBGRAPH_QUERY_URL in your .env.setup file');
    process.exit(1);
  }
}

main();

