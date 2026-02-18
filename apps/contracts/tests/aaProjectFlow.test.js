const { expect } = require('chai');
const { ethers } = require('hardhat');

const { signMetaTxRequest } = require('../utils/signer.js');
const triggerSources = require('./triggerSources.json');
const { getRandomEthAddress } = require('./common.js');
const { generateMultiCallData } = require('../utils/signer.js');

async function getMetaTxRequest(
  signer,
  forwarderContract,
  storageContract,
  functionName,
  params
) {
  return signMetaTxRequest(signer, forwarderContract, {
    from: signer.address,
    to: storageContract.target,
    data: storageContract.interface.encodeFunctionData(functionName, params),
  });
}

async function getHash(otp) {
  const bytes32 = ethers.toUtf8Bytes(otp);
  const keecakHash = ethers.keccak256(bytes32);
  return keecakHash;
}

describe('------ AA ProjectFlow Tests ------', function () {
  let deployer;
  let ben1;
  let ben2;
  let notRegisteredBen;
  let ven1;
  let user;
  let aaProjectContract;
  let rahatDonorContract;
  let accessManagerContract;
  let triggerManagerContract;
  let forwarderContract;
  let rahatTokenContract;
  let requiredTrigger = 2;
  let triggerAddress1;
  let triggerAddress2;
  let triggerAddress3;
  let rahatTokenAddress;
  let cashTokenContract;
  let cashTokenContractAddress;
  const [triggerSource1, triggerSource2, triggerSource3] = triggerSources;

  before(async function () {
    const [addr0, addr1, addr2, addr3, addr4, addr5, addr6, addr7, addr8] =
      await ethers.getSigners();
    deployer = addr0;
    admin = addr1;
    ben1 = addr2;
    ben2 = addr3;
    ven1 = addr6;
    triggerAddress1 = addr7;
    triggerAddress2 = addr4;
    triggerAddress3 = addr5;
    user = addr8;
  });

  describe('Deployment', function () {
    it('Should deploy all required contracts', async function () {
      accessManagerContract = await ethers.deployContract(
        'RahatAccessManager',
        [admin.address]
      );
      console.log('AccessManager deployed at: ', accessManagerContract.target);
      triggerManagerContract = await ethers.deployContract('TriggerManager', [
        requiredTrigger,
      ]);
      rahatDonorContract = await ethers.deployContract('RahatDonor', [
        admin.address,
        accessManagerContract.target,
      ]);
      forwarderContract = await ethers.deployContract('ERC2771Forwarder', [
        'Rumsan Forwarder',
      ]);
      rahatTokenContract = await ethers.deployContract('RahatToken', [
        await forwarderContract.getAddress(),
        'RahatToken',
        'RHT',
        await rahatDonorContract.getAddress(),
        1,
      ]);
      aaProjectContract = await ethers.deployContract('AAProject', [
        'AAProject',
        rahatTokenContract.target,
        forwarderContract.target,
        accessManagerContract.target,
        triggerManagerContract.target,
      ]);
      rahatTokenAddress = rahatTokenContract.getAddress();

      await accessManagerContract
        .connect(admin)
        .grantRole(0, rahatDonorContract.target, 0);
      cashTokenContract = await ethers.deployContract('CashToken', [
        'CashToken',
        'CT',
        '18',
        '1000',
        await rahatDonorContract.getAddress(),
      ]);
      cashTokenContractAddress = await cashTokenContract.getAddress();
      // await aaProjectContract.updateAdmin(await rahatDonorContract.getAddress(), true);
      rahatDonorContract
        .connect(admin)
        .registerProject(await aaProjectContract.getAddress(), true);
    });

    it('should update trigger sources', async function () {
      console.log(
        triggerSource1.id,
        triggerSource1.name,
        triggerSource1.details,
        triggerAddress1.address
      );
      await triggerManagerContract
        .connect(admin)
        .updateTriggerSource(
          ethers.id(triggerSource1.id),
          triggerSource1.name,
          triggerSource1.details,
          triggerAddress1.address
        );

      await triggerManagerContract
        .connect(admin)
        .updateTriggerSource(
          ethers.id(triggerSource2.id),
          triggerSource2.name,
          triggerSource2.details,
          triggerAddress2.address
        );

      await triggerManagerContract
        .connect(admin)
        .updateTriggerSource(
          ethers.id(triggerSource3.id),
          triggerSource3.name,
          triggerSource3.details,
          triggerAddress3.address
        );

      const contractTriggerData1 = await triggerManagerContract.triggerSources(
        ethers.id(triggerSource1.id)
      );
      const contractTriggerData2 = await triggerManagerContract.triggerSources(
        ethers.id(triggerSource2.id)
      );
      const contractTriggerData3 = await triggerManagerContract.triggerSources(
        ethers.id(triggerSource3.id)
      );
      expect(contractTriggerData1[0]).to.equal(triggerSource1.name);
      expect(contractTriggerData2[0]).to.equal(triggerSource2.name);
      expect(contractTriggerData3[0]).to.equal(triggerSource3.name);
    });

    it('should send funds to the aa contract', async function () {
      await rahatDonorContract
        .connect(admin)
        .mintTokens(
          rahatTokenContract.target,
          aaProjectContract.target,
          cashTokenContractAddress,
          user,
          1000000
        );
      expect(
        await rahatTokenContract.balanceOf(aaProjectContract.target)
      ).to.equal(1000000);
    });

    it('should trigger the project via source1', async function () {
      await triggerManagerContract
        .connect(triggerAddress1)
        .trigger(ethers.id(triggerSource1.id));
      expect(
        await triggerManagerContract.connect(triggerAddress1).getTriggerCount()
      ).to.equal(1);
    });

    it('should trigger the project via source2', async function () {
      await triggerManagerContract
        .connect(triggerAddress2)
        .trigger(ethers.id(triggerSource2.id));
      expect(
        await triggerManagerContract.connect(triggerAddress1).getTriggerCount()
      ).to.equal(2);
    });

    it('should  be able to assign tokens to beneficiaries ', async function () {
      await aaProjectContract
        .connect(admin)
        .assignTokenToBeneficiary(ben1.address, 100);
      expect(await aaProjectContract.benTokens(ben1.address)).to.equal(100);
    });

    it('should be able to transfer the beneficiaries token to vendor ', async function () {
      await aaProjectContract
        .connect(admin)
        .transferTokenToVendor(ben1.address, ven1.address, 10);
      expect(await rahatTokenContract.balanceOf(ven1.address), 10);
      expect(await aaProjectContract.benTokens(ben1.address)).to.equal(90);
    });
  });
});
