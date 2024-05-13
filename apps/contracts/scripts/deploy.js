const { ethers, run, upgrades } = require("hardhat");
const { writeFileSync, readFileSync } = require('fs');

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

async function main(){

    const [deployer] = await ethers.getSigners();

    // Uncomment next 3 lines to only update admin

    // const elProject = await ethers.getContractFactory('ELProject')
    // const elContract = await elProject.attach('0xaC29e7A5b6A4657a4B98E43F3b9517152867c896')
    // await elContract.updateAdmin('0xBc7d88DE6057265f602942c5b189dCcFAf8D2D9e',true);

    console.log("---deploying rahat donor------")
    const donorContract = await ethers.deployContract('RahatDonor',[deployer.address])
    const donorAddress = await donorContract.getAddress();
    console.log("deployed rahat donor")
    console.log("Deploying rahat claim")
    const rahatclaim = await ethers.deployContract('RahatClaim');
    const claimAddress = await rahatclaim.getAddress();
    console.log("deploying forwarder contract")
    const forwarder = await ethers.deployContract('ERC2771Forwarder',['ELForwarder']);
    const forwarderAddress = await forwarder.getAddress();
    console.log("deploying eye voucher")
    const eyeVoucher = await ethers.deployContract('RahatToken',[forwarderAddress,'EyeVoucher','Eye',donorAddress,1]);
    const eyeVoucherAddress = await eyeVoucher.getAddress();
    console.log("deploying referral voucher");
    const referralVoucher = await ethers.deployContract('RahatToken',[forwarderAddress,'Refeeral Voucher','Referral',donorAddress,1]);
    const referralVoucherAddress = await referralVoucher.getAddress();
    console.log("deploying el project")
    const elProject = await ethers.deployContract('ELProject',['ELProject',eyeVoucherAddress,referralVoucherAddress,claimAddress, process.env.OTP_SERVER_ADDRESS,forwarderAddress,3]);
    const elProjectAddress = await elProject.getAddress();
    console.log({donorAddress,
        claimAddress,
        eyeVoucherAddress,
        forwarderAddress,
        referralVoucherAddress,
        elProjectAddress,})

        console.log("---adding admin in el project----")
        await elProject.updateAdmin(donorAddress,true);
        console.log('-----register project in donor---')
        await donorContract.registerProject(elProjectAddress,true);

    writeToFile(`${__dirname}/deployments.json`, {
        donorAddress,
        claimAddress,
        forwarderAddress,
        eyeVoucherAddress,
        referralVoucherAddress,
        elProjectAddress,
    })
    await sleep(20000)

    console.log("Verifying Contracts")
    console.log("Verifiying Rahat Donor")
    await verify(donorAddress,[deployer.address]);
    console.log("Verifying Rahat claim")
    await verify(claimAddress);
    console.log('veriying forwarder')
    await verify(forwarderAddress,['ELForwarder'])
    console.log('verfiying eye voucher')
    await verify(eyeVoucher,[forwarderAddress,'EyeVoucher','Eye',donorAddress,1])
    console.log('verifying referral voucher')
    await verify(referralVoucherAddress,[forwarderAddress,'Refeeral Voucher','Referral',donorAddress,1]);
    console.log('verifying el project')
    await verify(elProjectAddress,['ELProject',eyeVoucherAddress,referralVoucherAddress,claimAddress, process.env.OTP_SERVER_ADDRESS,forwarderAddress,3]);
    console.log("verification completed")

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });