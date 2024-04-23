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

describe.only('------ ElProjectFlow Tests ------', function () {
    let deployer
    let ben1;
    let ben2;
    let notRegisteredBen;
    let ven1;
    let notApprovedVen;
    let eyeTokenContract;
    let referredTokenContract;
    let aaProjectContract;
    let rahatDonorContract;
    let accessManagerContract;
    let forwarderContract;
    let rahatTokenContract

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
            accessManagerContract = await ethers.deployContract('AccessManager', [[deployer.address]]);
            rahatDonorContract = await ethers.deployContract('RahatDonor', [deployer.address, await accessManagerContract.getAddress()]);
            forwarderContract = await ethers.deployContract("ERC2771Forwarder", ["Rumsan Forwarder"]);
            rahatTokenContract = await ethers.deployContract('RahatToken', [await forwarderContract.getAddress(), 'RahatToken', 'RHT', await rahatDonorContract.getAddress(), 1]);
            aaProjectContract = await ethers.deployContract('AAProject', ["AAProject",
                await rahatTokenContract.getAddress(),
                await forwarderContract.getAddress(),
                await accessManagerContract.getAddress()]);

            await accessManagerContract.updateAdmin(await rahatDonorContract.getAddress(), true);
            // await aaProjectContract.updateAdmin(await rahatDonorContract.getAddress(), true);
            rahatDonorContract.registerProject(await aaProjectContract.getAddress(), true);

        })
    })
})