import * as fs from 'fs/promises'

(async function () {
    const rootPath = process.argv[2]
    const rootEnv = `${rootPath}/.env`
    const projectID = await getProjectID(rootEnv)
    const contractAddressesPath = `${rootPath}/tools/project-scripts/local-setup/deployments/${projectID}.json`
    const networksFilePath = `${rootPath}/apps/graph/networks.json`
    modifyNetworksFile(contractAddressesPath, networksFilePath)

})()


async function modifyNetworksFile(contractAddressPath: string, networksFilePath: string) {
    try {
        const contractData = await fs.readFile(contractAddressPath, 'utf-8');
        const newAddresses = JSON.parse(contractData)

        const networksData = await fs.readFile(networksFilePath, 'utf-8');
        const networks = JSON.parse(networksData)

        const newNetworksData = {
            ...networks,
            mainnet: newAddresses
        }

        const stringified = JSON.stringify(newNetworksData, null, 4) //prettified
        await fs.writeFile(networksFilePath, stringified, 'utf-8')

        console.log("Modified networks.json.")
    } catch (error) {
        console.error('Error processing json file:', error);
    }
}

async function getProjectID(envPath: string) {
    try {
        const data = await fs.readFile(envPath, 'utf-8');
        const lines = data.split('\n') as string[];

        for (const line of lines) {
            if (line.startsWith('PROJECT_ID')) {
                const d = line.split('=')
                return d[1]
            }
        }
    } catch (error) {
        console.error('Error reading .env file:', error);
    }
}
