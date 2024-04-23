const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getRandomDonorData } = require("./common.js")
const { generateMultiCallData } = require("../utils/signer.js")

describe('RahatDonor', function () {
  let deployer;
  let admin;
  let user;
  let rahatDonorContract;
  let rahatTokenContract;
  let elProjectContract;
  let referredTokenContract;
  let eyeTokenContract;
  let accessManagerContract;

  before(async function () {
    const [deployerAddr, adminAddr, userAddr, projectAdr] = await ethers.getSigners();
    deployer = deployerAddr;
    admin = adminAddr;
    user = userAddr;
    project = projectAdr;
  });


  describe('Deployment', function () {
    it('Should deploy RahatDonor contract', async function () {
      accessManagerContract = await ethers.deployContract('AccessManager', [[admin.address]]);
      rahatDonorContract = await ethers.deployContract('RahatDonor', [admin.address, await accessManagerContract.getAddress()]);
      await accessManagerContract.connect(admin).updateAdmin(await rahatDonorContract.getAddress(), true);
    });

    it('Should deploy RahatToken contract', async function () {
      const forwarderContract = await ethers.deployContract('ERC2771Forwarder', [
        'Rumsan Forwarder',
      ]);
      rahatTokenContract = await ethers.deployContract('RahatToken', [
        await forwarderContract.getAddress(),
        'RahatToken',
        'RAHAT',
        await rahatDonorContract.getAddress(),
        18,
      ]);
      referredTokenContract = await ethers.deployContract('RahatToken', [await forwarderContract.getAddress(), 'ReferredToken', 'REF', await rahatDonorContract.getAddress(), 1]);

      // Check if the RahatToken contract is deployed successfully
      expect(await rahatTokenContract.name()).to.equal('RahatToken');
      expect(await rahatTokenContract.symbol()).to.equal('RAHAT');
      expect(await rahatTokenContract.decimals()).to.equal(18);
    });

    it('Should deploy all required contracts', async function () {
      let rahatClaimContract = await ethers.deployContract('RahatClaim');
      let forwarderContract = await ethers.deployContract('ERC2771Forwarder', ['Rumsan Forwarder']);
      eyeTokenContract = await ethers.deployContract('RahatToken', [
        await forwarderContract.getAddress(),
        'EyeToken',
        'EYE',
        await rahatDonorContract.getAddress(),
        1,
      ]);
      elProjectContract = await ethers.deployContract('ELProject', [
        'ELProject',
        await eyeTokenContract.getAddress(),
        await rahatTokenContract.getAddress(),
        await rahatClaimContract.getAddress(),
        deployer.address,
        await forwarderContract.getAddress(),
        10,
        await accessManagerContract.getAddress()
      ]);
      await elProjectContract.connect(admin).updateAdmin(await rahatDonorContract.getAddress(), true);
    });
  });

  describe('Token Minting and Approval', function () {
    it('Should mint tokens and approve project', async function () {
      const mintAmount = 100n;
      await rahatDonorContract
        .connect(admin)
        .registerProject(await elProjectContract.getAddress(), true);

      const projectBalanceInitial = await rahatTokenContract.balanceOf(await elProjectContract.getAddress());
      console.log("project balance initial", projectBalanceInitial);

      const isDonor = await accessManagerContract.isDonor(admin.address);
      console.log("isDonor", isDonor);
      // Mint tokens and approve project
      await rahatDonorContract
        .connect(admin)
        .mintTokenAndApprove(
          await rahatTokenContract.getAddress(),
          await referredTokenContract.getAddress(),
          await elProjectContract.getAddress(),
          mintAmount,
          3
        );

      // Check if the project balance is updated
      const freeVoucherBalance = await rahatTokenContract.balanceOf(await elProjectContract.getAddress());
      const referredVoucherBalance = await referredTokenContract.balanceOf(await elProjectContract.getAddress());
      expect(freeVoucherBalance).to.equal(mintAmount);
      expect(referredVoucherBalance).to.equal(mintAmount * 3n)
    });

    it('Should mint tokens, approve project, update description, price and currency', async function () {
      const initialContractBalance = await rahatTokenContract.balanceOf(elProjectContract.getAddress());
      const mintAmount = 100n;
      const priceFree = 10;
      const priceReferral = 1;
      const currency = 'USD';
      await rahatDonorContract
        .connect(admin)
        .registerProject(await elProjectContract.getAddress(), true);

      await rahatDonorContract
        .connect(admin)
      ['mintTokenAndApproveDescription(address, address, address, uint256, string, string, uint256, uint256, uint256, string)'](await rahatTokenContract.getAddress(), await referredTokenContract.getAddress(), await elProjectContract.getAddress(), mintAmount, 'New description Free', 'New description Referred', priceFree, priceReferral, 3, currency);

      // Check if the project balance is updated
      const projectBalance = await rahatTokenContract.balanceOf(elProjectContract.getAddress());
      expect(projectBalance).to.equal(initialContractBalance + mintAmount);

      // Check if voucher price is updated
      expect(await rahatTokenContract.price()).to.equal(10)
    });

    it('Should multicall mint tokens, approve project and update description', async function () {
      const initialContractBalance = await rahatTokenContract.balanceOf(elProjectContract.getAddress());
      const initialReferredTokenBalance = await referredTokenContract.balanceOf(elProjectContract.getAddress());
      const mintAmount = 100n;
      const referralLimit = 3n;

      const multicallInfo = getRandomDonorData(await rahatTokenContract.getAddress(), await referredTokenContract.getAddress(), await elProjectContract.getAddress(), mintAmount, referralLimit, 'New description')

      const multicallData = generateMultiCallData(rahatDonorContract, 'mintTokenAndApproveDescription(address, address, address, uint256, string, string, uint256, uint256, uint256, string)', multicallInfo);
      await rahatDonorContract.connect(admin).multicall(multicallData)
      const projectBalance = await rahatTokenContract.balanceOf(elProjectContract.getAddress());
      const referralBalance = await referredTokenContract.balanceOf(elProjectContract.getAddress());
      expect(projectBalance).to.equal(initialContractBalance + 5n * mintAmount);
      console.log(referralBalance)
      expect(referralBalance).to.equal(initialReferredTokenBalance + 5n * referralLimit * mintAmount)
    });

  });


});
