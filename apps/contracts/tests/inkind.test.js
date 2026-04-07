const { ethers } = require('hardhat');
const { expect } = require('chai');
describe('----- InkindToken Contract -----', function () {
  let inkindTokenContract;
  let admin;
  let vendor1;
  let rahatDonorContract;
  let forwarderContract;
  let accessManagerContract;
  let inkind1, inkind2, inkind3;
  let beneficiary1;

  const toBytes16 = (text) => {
    if (text.length > 16) {
      throw new Error('text must be 16 chars or fewer');
    }
    return ethers.encodeBytes32String(text).slice(0, 34);
  };

  before(async function () {
    const [addr0, addr1, addr2, addr3] = await ethers.getSigners();
    admin = addr0;
    vendor1 = addr1;
    beneficiary1 = addr2;
    newAdmin = addr3;
    inkind1 = toBytes16('Inkind 1');
    inkind2 = toBytes16('Inkind 2');
    inkind3 = toBytes16('Inkind 3');
  });

  describe('Deployment', function () {
    it('Should deploy RahatToken contract', async function () {
      accessManagerContract = await ethers.deployContract(
        'RahatAccessManager',
        [admin.address]
      );
      await accessManagerContract
        .connect(admin)
        .grantRole(0, newAdmin.address, 0);
      const isAdmin = await accessManagerContract.isAdmin(newAdmin.address);
      console.log('Is newAdmin an admin?', isAdmin);
      forwarderContract = await ethers.deployContract('ERC2771Forwarder', [
        'Rumsan Forwarder',
      ]);
      rahatDonorContract = await ethers.deployContract('RahatDonor', [
        admin.address,
        accessManagerContract.target,
      ]);
      rahatTokenContract = await ethers.deployContract('RahatToken', [
        await forwarderContract.getAddress(),
        'RahatToken',
        'RHT',
        admin.address,
        1,
      ]);
      console.log('RahatToken deployed at: ', rahatTokenContract.target);

      // it('Should deploy InkindToken contract', async function () {
      inkindTokenContract = await ethers.deployContract('Inkind', [
        rahatTokenContract.target,
        accessManagerContract.target,
      ]);
      console.log('InkindToken deployed at: ', inkindTokenContract.target);
      // });

      console.log('provide owner role to inkind contract');
      await rahatTokenContract
        .connect(admin)
        .addOwner(inkindTokenContract.target);
    });
  });

  describe('InkindToken Functionality', function () {
    it('Should be allowed to redeem inkind', async function () {
      await inkindTokenContract
        .connect(newAdmin)
        .redeemInkind([inkind1], vendor1.address, beneficiary1.address, 1);
    });

    it('Should be allowed to redeem multiple inkinds', async function () {
      await inkindTokenContract
        .connect(newAdmin)
        .redeemInkind(
          [inkind2, inkind3],
          vendor1.address,
          beneficiary1.address,
          2
        );
    });

    it('Should update redeemedInkind mapping', async function () {
      await inkindTokenContract
        .connect(newAdmin)
        .redeemInkind([inkind1], vendor1.address, beneficiary1.address, 1);
      const redeemed = await inkindTokenContract.redeemedInkind(inkind1);
      expect(redeemed).to.equal(beneficiary1.address);
    });

    it('Should emit InkindRedeemed event', async function () {
      await expect(
        inkindTokenContract
          .connect(newAdmin)
          .redeemInkind([inkind1], vendor1.address, beneficiary1.address, 1)
      )
        .to.emit(inkindTokenContract, 'InkindRedeemed')
        .withArgs(inkind1, vendor1.address, beneficiary1.address);
    });

    it('Should map each inkind to beneficiary', async function () {
      await inkindTokenContract
        .connect(newAdmin)
        .redeemInkind([inkind1], vendor1.address, beneficiary1.address, 1);
      const redeemed = await inkindTokenContract.redeemedInkind(inkind1);
      expect(redeemed).to.equal(beneficiary1.address);
    });

    it('Should handle multiple inkind mappings', async function () {
      await inkindTokenContract
        .connect(newAdmin)
        .redeemInkind([inkind1], vendor1.address, beneficiary1.address, 1);
      await inkindTokenContract
        .connect(newAdmin)
        .redeemInkind([inkind2], vendor1.address, beneficiary1.address, 1);

      expect(await inkindTokenContract.redeemedInkind(inkind1)).to.equal(
        beneficiary1.address
      );
      expect(await inkindTokenContract.redeemedInkind(inkind2)).to.equal(
        beneficiary1.address
      );
    });

    it('Should update beneficiaryVendors', async function () {
      await inkindTokenContract
        .connect(newAdmin)
        .redeemInkind([inkind1], vendor1.address, beneficiary1.address, 1);
      const vendor = await inkindTokenContract.beneficiaryVendors(
        beneficiary1.address
      );
      expect(vendor).to.equal(vendor1.address);
    });
  });
});
