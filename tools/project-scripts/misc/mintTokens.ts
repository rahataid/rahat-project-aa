import { ContractLib } from "../_common";

class ProjectFundManagemet extends ContractLib {
    projectUUID: string;

    constructor() {
        super()
        this.projectUUID = process.env.PROJECT_ID as string
    }
    public async fundProject(amount: number) {
        const deployerAccount = this.getWalletFromPrivateKey(this.deployerAddress);
        const projecttx = await this.callContractMethod('RahatDonor', 'mintTokens', [this.getDeployedAddress(this.projectUUID, 'RahatToken'), this.getDeployedAddress(this.projectUUID, 'AAProject'), amount], 'RahatDonor', this.projectUUID, deployerAccount);
        projecttx.wait();
        console.log(projecttx);
    }

}

async function main() {
    const projectFundManagemet = new ProjectFundManagemet();
    await projectFundManagemet.fundProject(10000);
    console.log("Minting rahat tokens.")
    process.exit(0);
}
main();