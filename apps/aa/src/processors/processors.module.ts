import { Module } from '@nestjs/common';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { PrismaService } from '@rumsan/prisma';
import { ContractProcessor } from './contract.processor';
import { StatsProcessor } from './stats.processor';
import { StellarProcessor } from './stellar.processor';
import { OfframpProcessor } from './offramp.processor';
import { VendorOfflinePayoutProcessor } from './vendor-cva-payout.processor';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import { StellarModule } from '../stellar/stellar.module';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { CheckTrustlineProcessor } from './checkTrutline.processor';
import { PayoutsModule } from '../payouts/payouts.module';
import { SettingsService } from '@rumsan/settings';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { NotificationProcessor } from './notification.processor';

@Module({
  imports: [
    StellarModule,
    BeneficiaryModule,
    PayoutsModule,
    StakeholdersModule,
    ClientsModule.register([
      {
        name: CORE_MODULE,
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: +process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
        },
      },
    ]),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR,
    }),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR_CHECK_TRUSTLINE,
    }),
    BullModule.registerQueue({
      name: BQUEUE.OFFRAMP,
    }),
    BullModule.registerQueue({
      name: BQUEUE.VENDOR_CVA,
    }),
  ],
  providers: [
    PrismaService,
    ContractProcessor,
    StatsProcessor,
    StellarProcessor,
    CheckTrustlineProcessor,
    NotificationProcessor,
    OfframpProcessor,
    VendorOfflinePayoutProcessor,
    {
      provide: ReceiveService,
      useFactory: async (settingsService: SettingsService) => {
        const stellarSettings = await settingsService.getPublic(
          'STELLAR_SETTINGS'
        );
        return new ReceiveService(
          (stellarSettings.value as any).ASSETISSUER,
          (stellarSettings.value as any).ASSETCODE,
          (stellarSettings.value as any).NETWORK,
          (stellarSettings.value as any).FAUCETSECRETKEY,
          (stellarSettings.value as any).FUNDINGAMOUNT,
          (stellarSettings.value as any).HORIZONURL
        );
      },
      inject: [SettingsService],
    },
  ],
})
export class ProcessorsModule {}
