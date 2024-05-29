import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import * as dotenv from 'dotenv';
import { ContractLib } from './_common';
dotenv.config();

const prismaClient = new PrismaClient({
    datasourceUrl: process.env.CORE_DATABASE_URL as string
});

const prisma = new PrismaService();
const settings = new SettingsService(prisma);
const subGraphURL = process.argv[2]

class SettingsSeed extends ContractLib {
    projectUUID: string;

    constructor() {
        super()
        this.projectUUID = process.env.PROJECT_ID as string
    }

    async getELDevSettings() {
        const [devSettings] = await prismaClient.$queryRaw<any[]>(
            Prisma.sql([`SELECT *  FROM tbl_settings WHERE name='AA_DEV'`])
        )
        return devSettings
    }

    async updateProjectStatus(status = 'ACTIVE') {
        await prismaClient.$queryRaw<any[]>(
            Prisma.sql([`UPDATE tbl_projects SET status='${status}' WHERE uuid='${this.projectUUID}'`])
        )
        console.log(`Project status updated to ${status}`)
    }
    //Insert AccessManager contract address in tbl_settings
    async addAccessManager() {
        const accessManager = this.getDeployedAddress(this.projectUUID, 'AccessManager');
        await prismaClient.$executeRaw<any[]>(
            Prisma.sql([`INSERT INTO tbl_settings (name, value, "dataType" , "isPrivate") VALUES ('ACCESS_MANAGER', '${JSON.stringify(accessManager)}' , 'STRING', 'false')`])
        )
    }

    public async addAppSettings() {
        await settings.create({
            name: 'Blockchain',
            value: {
                chainId: process.env.CHAIN_ID,
                rpcUrl: process.env.NETWORK_PROVIDER,
                chainName: process.env.CHAIN_NAME,
                networkId: process.env.CHAIN_ID,
                nativeCurrency: {
                    name: process.env.CURRENCY_NAME,
                    symbol: process.env.CURRENCY_SYMBOL,
                },
            },
            isPrivate: false
        });
    }

    public async addAdminAddress(adminAcc: string) {

        await settings.create({
            name: 'Admin',
            value: {
                address: adminAcc,
            },
            isPrivate: false
        })
    }

    public async addGraphSettings() {
        const formatted = subGraphURL?.substring(0, subGraphURL.indexOf('\\') !== -1 ? subGraphURL.indexOf('\\') : undefined);
        const formattedURL = formatted ? formatted : 'http://localhost:8000/subgraphs/name/rahat/el'
        await settings.create({
            name: 'SUBGRAPH_URL',
            value: {
                url: formattedURL
            },
            isPrivate: false
        })
    }


    public async addAdminToEl(addresses: any) {
        const adminValues = addresses.map((address: any) => [address, true]);
        const multicallData = await this.generateMultiCallData('AccessManager', 'updateAdmin', adminValues);
        const contracts = await this.getContracts('AccessManager', this.projectUUID, 'AccessManager');
        const res = await contracts.multicall(multicallData);
        await this.delay(2000)
        console.log(`Added Admins ${addresses} to AccessManager`)
    }

    public async addDonor(addresses: any) {
        const adminValues = addresses.map((address: any) => [address, true]);
        const multicallData = await this.generateMultiCallData('AccessManager', 'updateDonor', adminValues);
        const contracts = await this.getContracts('AccessManager', this.projectUUID, 'AccessManager');
        const res = await contracts.multicall(multicallData);
        await this.delay(2000)
        console.log(`Added Donor ${addresses} to  Project`)
    }
}
async function main() {
    const seedProject = new SettingsSeed();
    const devSettings = await seedProject.getELDevSettings()
    const adminAccounts = devSettings.value!.adminAccounts

    await seedProject.addAppSettings();
    await seedProject.addAdminAddress(adminAccounts[0]);
    await seedProject.addGraphSettings();

    await seedProject.addAdminToEl(adminAccounts);
    await seedProject.addDonor(adminAccounts)
    await seedProject.updateProjectStatus();
    await seedProject.addAccessManager();

    console.log("=====Local Settings Seeded Successfully=====")

    process.exit(0);
}
main();
