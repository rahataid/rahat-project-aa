import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { BullModule } from '@nestjs/bull';
import { VendorsService } from './vendors.service';
import { VendorTokenRedemptionService } from './vendorTokenRedemption.service';
import { VendorsController } from './vendors.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CORE_MODULE, BQUEUE } from '../constants';
// TODO: STELLAR DETACH - re-enable once stellar module is rewritten and exposes a
// ReceiveService/equivalent for vendor balance lookups.
// import { ReceiveService } from '@rahataid/stellar-sdk';
// import { SettingsService } from '@rumsan/settings';
// import { StellarModule } from '../stellar/stellar.module';
import { VendorTokenRedemptionProcessor } from '../processors/vendorTokenRedemption.processor';

@Module({
  imports: [
    PrismaModule,
    // TODO: STELLAR DETACH - re-add StellarModule once it is rewritten.
    // StellarModule,
    BullModule.registerQueue({
      name: BQUEUE.VENDOR,
    }),
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
      name: BQUEUE.VENDOR_CVA,
    }),
    BullModule.registerQueue({
      name: BQUEUE.BATCH_TRANSFER,
    }),
  ],
  providers: [
    VendorsService,
    VendorTokenRedemptionService,
    VendorTokenRedemptionProcessor,
    // TODO: STELLAR DETACH - re-add a ReceiveService-equivalent provider once the
    // rewritten stellar module exposes a balance-lookup service.
    // {
    //   provide: ReceiveService,
    //   useFactory: async (settingService: SettingsService) => {
    //     const settings = await settingService.getPublic('STELLAR_SETTINGS');
    //
    //     return new ReceiveService(
    //       settings?.value['ASSETCREATOR'],
    //       settings?.value['ASSETCODE'],
    //       settings?.value['NETWORK'],
    //       settings?.value['FAUCETSECRETKEY'],
    //       settings?.value['FUNDINGAMOUNT'],
    //       settings?.value['HORIZONURL']
    //     );
    //   },
    //   inject: [SettingsService],
    // },
  ],
  controllers: [VendorsController],
  // TODO: STELLAR DETACH - re-export ReceiveService-equivalent once rewritten.
  exports: [VendorsService, VendorTokenRedemptionService],
})
export class VendorsModule {}
