import { Prisma, SettingDataType } from '@prisma/client';
import { PrismaService } from '@rumsan/prisma';
import { Keypair } from '@stellar/stellar-sdk';

const prismaService = new PrismaService();

const SETTINGS_NAME = 'STELLAR_SPONSOR_SETTINGS';

export const seedStellarSponsorSettings = async () => {
  const sponsorSecret = process.env.STELLAR_SPONSOR_SECRET;
  if (!sponsorSecret) {
    throw new Error('STELLAR_SPONSOR_SECRET environment variable is required');
  }

  const sponsorPublicKey = Keypair.fromSecret(sponsorSecret).publicKey();

  const value: Prisma.InputJsonValue = {
    network: process.env.STELLAR_NETWORK ?? 'testnet',
    horizonUrl: process.env.STELLAR_HORIZON_URL ?? undefined,
    sponsorSecret,
    sponsorPublicKey,
    assetCode: process.env.STELLAR_ASSET_CODE ?? 'RAHAT',
    assetIssuer: process.env.STELLAR_ASSET_ISSUER ?? '',
  };

  await prismaService.setting.upsert({
    where: { name: SETTINGS_NAME },
    create: {
      name: SETTINGS_NAME,
      value,
      dataType: SettingDataType.OBJECT,
      isPrivate: false,
      requiredFields: [],
      isReadOnly: false,
    },
    update: {
      value,
      isPrivate: false,
    },
  });

  console.log(`${SETTINGS_NAME} seeded (sponsor public key: ${sponsorPublicKey})`);
};

if (require.main === module) {
  seedStellarSponsorSettings()
    .then(async () => {
      await prismaService.$disconnect();
    })
    .catch(async (error) => {
      console.error(error);
      await prismaService.$disconnect();
      process.exit(1);
    });
}
