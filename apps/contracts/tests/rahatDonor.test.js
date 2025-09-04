const { expect } = require('chai');
const { ethers } = require('hardhat');
const { getRandomDonorData } = require("./common.js")
const { generateMultiCallData } = require("../utils/signer.js")

describe('RahatDonor', function () {
  let deployer;
  let admin;
  let user;
  let user2;
  let rahatDonorContract;
  let rahatTokenContract;
  let elProjectContract;
  let referredTokenContract;
  let eyeTokenContract;
  let accessManagerContract;
  let cashTokenContract;
  let cashTokenContractAddress;

  before(async function () {
    const [deployerAddr, adminAddr, userAddr, projectAdr,userAddr2] = await ethers.getSigners();
    deployer = deployerAddr;
    admin = adminAddr;
    user = userAddr;
    project = projectAdr;
    user2= userAddr2;
  });


  describe('Deployment', function () {
    it('Should deploy RahatDonor contract', async function () {
      accessManagerContract = await ethers.deployContract('RahatAccessManager', [admin.address]);
      rahatDonorContract = await ethers.deployContract('RahatDonor', [admin.address, accessManagerContract.target]);
      await accessManagerContract.connect(admin).grantRole(0, rahatDonorContract.target, 0);
    });

    it('Should deploy RahatToken  and cashToken contracts', async function () {
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
      cashTokenContract = await ethers.deployContract('CashToken',['CashToken','CT','18','1000',await rahatDonorContract.getAddress()]);
      cashTokenContractAddress = await cashTokenContract.getAddress();

      // Check if the RahatToken contract is deployed successfully
      expect(await rahatTokenContract.name()).to.equal('RahatToken');
      expect(await rahatTokenContract.symbol()).to.equal('RAHAT');
      expect(await rahatTokenContract.decimals()).to.equal(18);

      expect(await cashTokenContract.name()).to.equal('CashToken');
      expect(await cashTokenContract.symbol()).to.equal('CT');
      expect(await cashTokenContract.decimals()).to.equal(18);

    });

    it('Should deploy all required contracts', async function () {
      let forwarderContract = await ethers.deployContract('ERC2771Forwarder', ['Rumsan Forwarder']);
      aaProjectContract = await ethers.deployContract('AAProject', [
        'AAProject',
        rahatTokenContract.target,
        forwarderContract.target,
        accessManagerContract.target,
        accessManagerContract.target,
      ]);
    });
  });

  describe('Token Minting and Approval', function () {
    it('Should mint tokens and approve project', async function () {
      const mintAmount = 100n;
      await rahatDonorContract
        .connect(admin)
        .registerProject(await aaProjectContract.getAddress(), true);

      const projectBalanceInitial = await rahatTokenContract.balanceOf(await aaProjectContract.getAddress());
      console.log("project balance initial", projectBalanceInitial);
      // Mint tokens and approve project
      await rahatDonorContract
        .connect(admin)
        .mintTokens(
          rahatTokenContract.target,
          aaProjectContract.target,
          cashTokenContractAddress,
          user2,
          mintAmount
        );
        const userBalance = await cashTokenContract.balanceOf(user2);
        const projectBalance = await rahatTokenContract.balanceOf(await aaProjectContract.getAddress());
        expect(userBalance).to.equal(mintAmount);

        expect(projectBalance).to.equal(mintAmount)

      // Check if the project balance is updated
      // const freeVoucherBalance = await rahatTokenContract.balanceOf(await aaProjectContract.getAddress());
      // const referredVoucherBalance = await referredTokenContract.balanceOf(await aaProjectContract.getAddress());
      // expect(freeVoucherBalance).to.equal(mintAmount);
      // expect(referredVoucherBalance).to.equal(mintAmount * 3n)
    });

    it("Should not be able to call the mint function expect admin", async function(){
            const mintAmount = 100n;

      await  expect(rahatDonorContract.connect(user).mintTokens(rahatTokenContract.target,
          aaProjectContract.target,
          cashTokenContractAddress,
          user2,
          mintAmount)).to.be.revertedWithCustomError(rahatDonorContract,"AccessManagedUnauthorized")
    })

    it("Donor Contract should be able to transfer OwnerShip of cashToken", async function(){
      await rahatDonorContract. connect(admin).changeCashTokenOwnerShip(cashTokenContractAddress,user2);
      const newOwner = await cashTokenContract.owner();
      expect(newOwner).to.equal(user2.address)
    })

    it("Should not be able to call the changeCashTokenOwnerShip function expect admin", async function(){
      await  expect(rahatDonorContract.connect(user).changeCashTokenOwnerShip(cashTokenContractAddress,user2)).to.be.revertedWithCustomError(rahatDonorContract,"AccessManagedUnauthorized")
    }
    )

    // it('Should multicall mint tokens, approve project and update description', async function () {
    //   const initialContractBalance = await rahatTokenContract.balanceOf(elProjectContract.getAddress());
    //   const initialReferredTokenBalance = await referredTokenContract.balanceOf(elProjectContract.getAddress());
    //   const mintAmount = 100n;
    //   const referralLimit = 3n;

    //   const multicallInfo = getRandomDonorData(await rahatTokenContract.getAddress(), await referredTokenContract.getAddress(), await elProjectContract.getAddress(), mintAmount, referralLimit, 'New description')

    //   const multicallData = generateMultiCallData(rahatDonorContract, 'mintTokenAndApproveDescription(address, address, address, uint256, string, string, uint256, uint256, uint256, string)', multicallInfo);
    //   await rahatDonorContract.connect(admin).multicall(multicallData)
    //   const projectBalance = await rahatTokenContract.balanceOf(elProjectContract.getAddress());
    //   const referralBalance = await referredTokenContract.balanceOf(elProjectContract.getAddress());
    //   expect(projectBalance).to.equal(initialContractBalance + 5n * mintAmount);
    //   console.log(referralBalance)
    //   expect(referralBalance).to.equal(initialReferredTokenBalance + 5n * referralLimit * mintAmount)
    // });

  });


});
