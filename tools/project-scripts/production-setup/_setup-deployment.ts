import * as dotenv from 'dotenv';
import { commonLib } from './_common';
import axios from 'axios';
import { DeployedContract } from '../types/blockchain';
import { Wallet } from 'ethers';
dotenv.config({ path: `${__dirname}/.env.prod` });


//RAHAT_ADMIN_PRIVATE_KEY
//BLOCKCHAIN
//SUBGRAPH_URL

const rahatTokenDetails = {
    name: 'RHT Coin',
    symbol: 'RHT',
    description: 'RHT Coin',
    decimals: 0,
    initialSupply: '100000',
};

class DeploymentSetup extends commonLib {
    contracts: Record<string, DeployedContract>;
    deployerAccount: Wallet;

    constructor() {
        super();
        this.contracts = {};
        this.deployerAccount = this.getDeployerWallet();

    }
    public async setupRahatAAContracts() {

        const url = `${process.env.RAHAT_CORE_URL}/v1/settings/CONTRACTS`;
        const { data } = await axios.get(url);
        const contracts = data?.data?.value;
        const RahatAccessManagerAddress = contracts.RAHATACCESSMANAGER.ADDRESS
        const RahatTreasuryAddress = contracts.RAHATTREASURY.ADDRESS
        const forwarderAddress = contracts.ERC2771FORWARDER.ADDRESS

        console.log('----------Depolying Trigger Manager-------------------');
        const TriggerManager = await this.deployContract('TriggerManager', [2]);
        this.contracts['TriggerManager'] = {
            address: TriggerManager.contract.target,
            startBlock: TriggerManager.blockNumber
        };
        console.log('----------Depolying Rahat Donor-------------------');
        const RahatDonor = await this.deployContract('RahatDonor', [this.deployerAccount, RahatAccessManagerAddress]);
        this.contracts['RahatDonor'] = {
            address: RahatDonor.contract.target,
            startBlock: RahatDonor.blockNumber
        };

        console.log('----------Depolying Rahat Token-------------------');
        const RahatToken = await this.deployContract(
            'RahatToken',
            [
                forwarderAddress, "RahatToken", "RHT", RahatDonor.contract.target, 0
            ]
        );
        this.contracts['RahatToken'] = {
            address: RahatToken.contract.target,
            startBlock: RahatToken.blockNumber
        };

        console.log('----------Depolying AA Project-------------------');
        const AAProjectContract = await this.deployContract('AAProject', [
            "AAProject",
            RahatToken.contract.target,
            forwarderAddress,
            RahatAccessManagerAddress,
            TriggerManager.contract.target
        ]);
        this.contracts['AAProject'] = {
            address: AAProjectContract.contract.target,
            startBlock: AAProjectContract.blockNumber
        };

        console.log('Writing deployed address to file');
        await this.writeToDeploymentFile(
            this.projectUUID,
            { CONTRACTS: this.contracts }
        );
        await this.writeToDeploymentFile(this.projectUUID, {
            RahatToken: {
                contractAddress: RahatToken.contract.target,
                name: rahatTokenDetails.name,
                symbol: rahatTokenDetails.symbol,
                description: rahatTokenDetails.description,
                decimals: rahatTokenDetails.decimals,
                initialSupply: rahatTokenDetails.initialSupply,
                fromBlock: RahatToken.blockNumber,
                transactionHash: RahatToken.hash,
                type: 'CREATED'
            }
        })
    }

    public async setupBlockchainNetowrk() {
        console.log("writing chain settings to file")
        const SUBGRAPH_URL = process.env.SUBGRAPH_QUERY_URL;
        const BLOCKCHAIN = {
            rpcUrl: process.env.NETWORK_PROVIDER,
            chainName: process.env.CHAIN_NAME,
            chainId: process.env.NETWORK_ID,
            nativeCurrency: {
                name: process.env.CURRENCY_NAME,
                symbol: process.env.CURRENCY_SYMBOL,
            },
        };
        await this.writeToDeploymentFile(this.projectUUID, { BLOCKCHAIN, SUBGRAPH_URL: { URL: SUBGRAPH_URL } });
        await this.writeToDeploymentFile(this.projectUUID, { projectUUID: this.projectUUID })
    }
    public async setupAdminKeys() {
        await this.writeToDeploymentFile(this.projectUUID,
            {
                ADMIN: { ADDRESS: this.deployerAccount.address },
                RAHAT_ADMIN_PRIVATE_KEY: this.deployerAccount.privateKey,
                DEPLOYER_PRIVATE_KEY: this.deployerAccount.privateKey

            })
    }

}

async function main() {
    const deploymentSetup = new DeploymentSetup();
    await deploymentSetup.setupRahatAAContracts();
    await deploymentSetup.setupBlockchainNetowrk();
    await deploymentSetup.setupAdminKeys();

}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
