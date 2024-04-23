const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('RahatToken', function () {
  let user;
  let admin;
  let user2;
  let rahatTokenContract;
  let forwarderContract;
  let mintAmount;

  before(async function () {
    const [addr1, addr2, addr3] = await ethers.getSigners();
    user = addr1;
    admin = addr2;
    user2 = addr3;
  });

  describe('Deployment', function () {
    it('Should deploy RahatToken contract', async function () {
      forwarderContract = await ethers.deployContract('ERC2771Forwarder', ['Rumsan Forwarder']);
      rahatTokenContract = await ethers.deployContract('RahatToken', [
        await forwarderContract.getAddress(),
        'RahatToken',
        'RAHAT',
        admin.address,
        18,
      ]);

      expect(await rahatTokenContract.name()).to.equal('RahatToken');
      expect(await rahatTokenContract.symbol()).to.equal('RAHAT');
      expect(await rahatTokenContract.decimals()).to.equal(18);
    });

    it('Should update token description', async function () {
      const newDescription = 'New token description';
      await rahatTokenContract.connect(admin).updateDescription(newDescription);

      expect(await rahatTokenContract.description()).to.equal(newDescription);
    });

    it('Should mint tokens to a user', async function () {
      mintAmount = 100;
      await rahatTokenContract.connect(admin).mint(user.address, mintAmount);

      const userBalance = await rahatTokenContract.balanceOf(user.address);
      expect(userBalance).to.equal(mintAmount);
    });

    it('Should mint tokens', async function () {
      mintAmount = 100;

      await rahatTokenContract
        .connect(admin)
        ['mint(address,uint256)'](user2.address, mintAmount);

      const userBalance = await rahatTokenContract.balanceOf(user2.address);
      expect(userBalance).to.equal(100);
    });

    it('Should burn tokens from a user', async function () {
      const burnAmount = 2;
      await rahatTokenContract.connect(user).approve(admin.address, burnAmount);

      await rahatTokenContract.connect(admin).burnFrom(user.address, burnAmount);

      const userBalance = await rahatTokenContract.balanceOf(user.address);
      expect(userBalance).to.equal(mintAmount - burnAmount);
    });

    it('Should revert if non-owner tries to mint tokens', async function () {
      const nonOwner = user;
      const mintAmount = 500;
      await expect(
        rahatTokenContract.connect(nonOwner).mint(user2.address, mintAmount)
      ).to.be.revertedWith('Only owner can execute this transaction');
    
      const user2Balance = await rahatTokenContract.balanceOf(user2.address);
      expect(user2Balance).to.equal(100);
    });

  });
});
