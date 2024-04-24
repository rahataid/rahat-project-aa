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
    let requiredTrigger = 2;

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
            triggerManagerContract = await ethers.deployContract('TriggerManager', [requiredTrigger]);
            rahatDonorContract = await ethers.deployContract('RahatDonor', [deployer.address, await accessManagerContract.getAddress()]);
            forwarderContract = await ethers.deployContract("ERC2771Forwarder", ["Rumsan Forwarder"]);
            rahatTokenContract = await ethers.deployContract('RahatToken', [await forwarderContract.getAddress(), 'RahatToken', 'RHT', await rahatDonorContract.getAddress(), 1]);
            aaProjectContract = await ethers.deployContract('AAProject', ["AAProject",
                rahatTokenContract.target,
                forwarderContract.target,
                accessManagerContract.target,
                triggerManagerContract.target
            ]);

            await accessManagerContract.updateAdmin(await rahatDonorContract.getAddress(), true);
            // await aaProjectContract.updateAdmin(await rahatDonorContract.getAddress(), true);
            rahatDonorContract.registerProject(await aaProjectContract.getAddress(), true);

        })

        it('should send funds to the contract', async function () {
            await rahatTokenContract.connect(deployer).mint(deployer.address, 1000000);
            await rahatTokenContract.connect(deployer).transfer(aaProjectContract.address, 100000);
        })

        it('should trigger the project', async function () {
            await aaProjectContract.connect(deployer).triggerProject();
        })

        it('should be able to assign tokens once triggeres', async function () {
            await aaProjectContract.connect(deployer).assignTokens([ben1.address, ben2.address], [100, 200]);
        })
    })
})