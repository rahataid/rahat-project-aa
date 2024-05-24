const { ethers, run, upgrades } = require("hardhat");
const { writeFileSync, readFileSync } = require('fs');
const { SettingsService } = require("@rumsan/settings");
const { PrismaService } = require("@rumsan/prisma");
const { getDeployedContractDetails } = require("../utils/common");

const prismaService = new PrismaService();
const settings = new SettingsService(prismaService);

const verify = async (contractAddress, args) => {
    console.log("Verifying contract...");
    try {
        await run("verify:verify", {
            address: contractAddress,
            constructorArguments: args,
        });
    } catch (e) {
        if (e.message.toLowerCase().includes("already verified")) {
            console.log("Already verified!");
        } else {
            console.log(e);
        }
    }
};

const sleep = (ms) => {
    console.log(`sleeping for ${ms} seconds`)
    return new Promise(resolve => setTimeout(resolve, ms));
}

const writeToFile = (filePath, newData) => {
    const fileData = readFileSync(filePath, 'utf8');
    const data = JSON.parse(fileData);
    data.push(newData);
    writeFileSync(filePath,
        JSON.stringify(data, null, 2))
}

async function main() {

    const [deployer] = await ethers.getSigners();

    // Uncomment next 3 lines to only update admin

    // const aaProject = await ethers.getContractFactory('aaProject')
    // const elContract = await aaProject.attach('0xaC29e7A5b6A4657a4B98E43F3b9517152867c896')
    // await elContract.updateAdmin('0xBc7d88DE6057265f602942c5b189dCcFAf8D2D9e',true);

    console.log("---deploy access manager---")
    const accessManangerContract = await ethers.deployContract('AccessManager', [[deployer.address]])
    const accessManagerAddress = await accessManangerContract.getAddress();
    console.log("---deploy trigger manager---")
    const triggerManagerContract = await ethers.deployContract('TriggerManager', [2])
    const triggerManagerAddress = await triggerManagerContract.getAddress();
    console.log("---deploying rahat donor------")
    const donorContract = await ethers.deployContract('RahatDonor', [deployer.address, accessManagerAddress])
    const donorAddress = await donorContract.getAddress();
    console.log("deployed rahat donor")
    console.log("deploying forwarder contract")
    const forwarder = await ethers.deployContract('ERC2771Forwarder', ['ELForwarder']);
    const forwarderAddress = await forwarder.getAddress();
    console.log("deploying AA voucher")
    const aaVoucher = await ethers.deployContract('RahatToken', [forwarderAddress, 'aaVoucher', 'AA', donorAddress, 1]);
    const aaVoucherAddress = await aaVoucher.getAddress();
    console.log("deploying AA project")
    const aaProject = await ethers.deployContract('AAProject', ['AAProject', aaVoucherAddress, forwarderAddress, accessManagerAddress, triggerManagerAddress]);
    const aaProjectAddress = await aaProject.getAddress();
    console.log("All contract deployed successfully.")
    console.log({
        donorAddress,
        aaVoucherAddress,
        forwarderAddress,
        aaProjectAddress,
        accessManagerAddress,
        triggerManagerAddress
    })

    console.log('-----register project in donor---')
    await donorContract.registerProject(aaProjectAddress, true);

    writeToFile(`${__dirname}/deployments.json`, {
        donorAddress,
        forwarderAddress,
        aaVoucherAddress,
        aaProjectAddress,
        accessManagerAddress,
        triggerManagerAddress
    })
    await sleep(200)

    let contractsDetails = [
        { name: 'AAProject', address: aaProjectAddress },
        { name: 'AccessManager', address: accessManagerAddress },
        { name: 'RahatDonor', address: donorAddress },
        { name: 'RahatToken', address: aaVoucherAddress },
        { name: 'TriggerManager', address: triggerManagerAddress }
    ]

    const contractValues = await getDeployedContractDetails(contractsDetails)

    // ***** seed settings start ***    
    console.log("Saving contract details to settings")
    await settings.create({
        name: 'CONTRACT',
        value: contractValues,
        isPrivate: false
    })
    console.log("Saved in settings successfully")
    // ***** seed settings complete ***



    console.log("Verifying Contracts")
    console.log("Verifiying Rahat Donor")
    await verify(donorAddress, [deployer.address, accessManagerAddress]);
    console.log('veriying forwarder')
    await verify(forwarderAddress, ['ELForwarder'])
    console.log('verfiying eye voucher')
    await verify(aaVoucherAddress, [forwarderAddress, 'aaVoucher', 'AA', donorAddress, 1])
    console.log('verifying el project')
    await verify(aaProjectAddress, ['AAProject', aaVoucherAddress, forwarderAddress, accessManagerAddress, triggerManagerAddress]);
    console.log("verification completed")

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });