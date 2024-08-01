import readline from 'readline';
import { ContractLib } from '../local-setup/_common';



class ManageAccess extends ContractLib {
    projectUUID: string;

    constructor() {
        super()
        this.projectUUID = process.env.PROJECT_ID as string
    }

    public async addDonor(addresses: `0x${string}`) {
        const deployerAccount = this.getWalletFromPrivateKey(this.deployerAddress);
        await this.callContractMethod('AccessManager', 'updateDonor', [addresses, true], 'AccessManager', this.projectUUID, deployerAccount);
        await this.delay(2000)
        console.log(`Added Donor ${addresses} to  Project`)

    }

    public addAdmin(addresses: `0x${string}`) {
        const deployerAccount = this.getWalletFromPrivateKey(this.deployerAddress);
        return this.callContractMethod('AccessManager', 'updateAdmin', [addresses, true], 'AccessManager', this.projectUUID, deployerAccount);
    }

    public addProjectManager(addresses: `0x${string}`) {
        const deployerAccount = this.getWalletFromPrivateKey(this.deployerAddress);
        return this.callContractMethod('AccessManager', 'updateProjectManager', [addresses, true], 'AccessManager', this.projectUUID, deployerAccount);
    }
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const manageAccess = new ManageAccess();

async function main() {
    rl.question('Please select a function to execute \n1: addAdmin, \n2: addDonor, \n3: addProjectManager\n ', async (selectedFunction) => {
        rl.question('Please enter the address: ', async (address: any) => {
            switch (selectedFunction) {
                case '1':
                    await manageAccess.addAdmin(address);
                    console.log('addAdmin function executed.');
                    break;
                case '2':
                    await manageAccess.addDonor(address);
                    console.log('addDonor function executed.');
                    break;
                case '3':
                    await manageAccess.addProjectManager(address);
                    console.log('addProjectManager function executed.');
                    break;
                default:
                    console.log('Invalid selection.');
            }

            rl.close();
        });
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });