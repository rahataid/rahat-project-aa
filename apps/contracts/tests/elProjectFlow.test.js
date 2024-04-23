const { expect } = require('chai');
const { ethers } = require('hardhat');

const { signMetaTxRequest } = require("../utils/signer")
const { getRandomEthAddress } = require("./common.js")
const { generateMultiCallData } = require("../utils/signer.js")

async function getMetaTxRequest(signer, forwarderContract, storageContract, functionName, params) {
    return signMetaTxRequest(
        signer,
        forwarderContract,
        {
            from: signer.address,
            to: storageContract.target,
            data: storageContract.interface.encodeFunctionData(functionName, params),
        },
    )
}

async function getHash(otp) {
    const bytes32 = ethers.toUtf8Bytes(otp);
    const keecakHash = ethers.keccak256(bytes32);
    return keecakHash;

}

describe('------ ElProjectFlow Tests ------', function () {
    let deployer
    let ben1;
    let ben2;
    let notRegisteredBen;
    let ven1;
    let notApprovedVen;
    let eyeTokenContract;
    let referredTokenContract;
    let elProjectContract;
    let rahatDonorContract;
    let accessManagerContract;
    let rahatClaimContract;
    let forwarderContract;
    let address0 = '0x0000000000000000000000000000000000000000';

    before(async function () {
        const [addr1, addr2, addr3, addr4, addr5, addr6, addr7] = await ethers.getSigners();
        deployer = addr1;
        ben1 = addr2;
        ben2 = addr3;
        ben3 = addr7;
        ven1 = addr4;
        notRegisteredBen = addr5;
        notApprovedVen = addr6;
    });

    describe('Deployment', function () {
        it('Should deploy all required contracts', async function () {
            console.log("deplouing access manager")
            accessManagerContract = await ethers.deployContract('AccessManager', [[deployer.address]]);
            console.log("deploying access manager", accessManagerContract)
            rahatDonorContract = await ethers.deployContract('RahatDonor', [deployer.address, await accessManagerContract.getAddress()]);
            rahatClaimContract = await ethers.deployContract('RahatClaim');
            forwarderContract = await ethers.deployContract("ERC2771Forwarder", ["Rumsan Forwarder"]);
            eyeTokenContract = await ethers.deployContract('RahatToken', [await forwarderContract.getAddress(), 'EyeToken', 'EYE', await rahatDonorContract.getAddress(), 1]);
            referredTokenContract = await ethers.deployContract('RahatToken', [await forwarderContract.getAddress(), 'ReferredToken', 'REF', await rahatDonorContract.getAddress(), 1]);
            elProjectContract = await ethers.deployContract('ELProject', ["ELProject", await eyeTokenContract.getAddress(), await referredTokenContract.getAddress(), await rahatClaimContract.getAddress(), deployer.address, await forwarderContract.getAddress(), 1, await accessManagerContract.getAddress()]);
            await accessManagerContract.updateAdmin(await rahatDonorContract.getAddress(), true);
            // await elProjectContract.updateAdmin(await rahatDonorContract.getAddress(), true);
            rahatDonorContract.registerProject(await elProjectContract.getAddress(), true);

        })
    })
})