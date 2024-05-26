const { ethers, run } = require("hardhat");
const { readFileSync } = require('fs');
const { SettingsService } = require("@rumsan/settings");
const { PrismaService } = require("@rumsan/prisma");

const prismaService = new PrismaService();

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

async function main() {
    const [deployer] = await ethers.getSigners();

    const deployedAddresses = JSON.parse(readFileSync(`${__dirname}/deployments.json`, 'utf8'));
    const latestDeployed = deployedAddresses.at(-1);

    console.log({ latestDeployed })
    console.log("Verifying Contracts")
    console.log("Verifiying Rahat Donor")
    await verify(latestDeployed.donorAddress, [deployer.address, latestDeployed.accessManagerAddress]);
    // console.log('veriying forwarder')
    // await verify(latestDeployed.forwarderAddress, ['ELForwarder'])
    // console.log('verfiying eye voucher')
    // await verify(latestDeployed.aaVoucherAddress, [latestDeployed.forwarderAddress, 'aaVoucher', 'AA', latestDeployed.donorAddress, 1])
    // console.log('verifying el project')
    // await verify(latestDeployed.aaProjectAddress, ['AAProject', latestDeployed.aaVoucherAddress, latestDeployed.forwarderAddress, latestDeployed.accessManagerAddress, latestDeployed.triggerManagerAddress]);
    // console.log("verification completed")

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });