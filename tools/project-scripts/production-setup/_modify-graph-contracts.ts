import * as fs from 'fs/promises';
import * as dotenv from 'dotenv';
// Load environment variables from .env.setup if it exists, otherwise fallback to .env
dotenv.config({ path: `${__dirname}/.env.setup` });
dotenv.config(); // Fallback to default .env


const modifyNetworksFile = async (
    projectUUID: string,
    networkName: string = 'mainnet',
) => {
    const graphNetworksPath = `${__dirname}/../../../apps/graph/networks.json`;
    const deploymentFilePath = `${__dirname}/deployments/${projectUUID}.json`;
    try {
        const contractData = await fs.readFile(deploymentFilePath, 'utf8');
        const newAddresses = JSON.parse(contractData).CONTRACTS;

        const networksData = await fs.readFile(graphNetworksPath, 'utf8');
        const networks = JSON.parse(networksData);

        const newNetworksData = {
            ...networks,
            [networkName]: newAddresses,
        };

        const stringified = JSON.stringify(newNetworksData, null, 2);
        await fs.writeFile(graphNetworksPath, stringified, 'utf-8');

        console.log(`Modified networks.json.`);
    } catch (error) {
        console.error(
            `Error processing JSON file: ${deploymentFilePath}`,
            error
        );
    }
};

(async function () {
    const projectUUID = process.env.PROJECT_UUID as string;
    const networkName = process.env.SUBGRAPH_NETWORK as string;
    modifyNetworksFile(projectUUID, networkName);
})();
