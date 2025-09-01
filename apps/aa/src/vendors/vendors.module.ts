import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { BullModule } from '@nestjs/bull';
import { VendorsService } from './vendors.service';
import { VendorTokenRedemptionService } from './vendorTokenRedemption.service';
import { VendorsController } from './vendors.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BQUEUE, CORE_MODULE } from '../constants';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { SettingsService } from '@rumsan/settings';
import { VendorTokenRedemptionProcessor } from '../processors/vendorTokenRedemption.processor';

@Module({
  imports: [
    PrismaModule,
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
  ],
  providers: [
    VendorsService,
    VendorTokenRedemptionService,
    VendorTokenRedemptionProcessor,
    {
      provide: ReceiveService,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');

        return new ReceiveService(
          settings?.value['ASSETCREATOR'],
          settings?.value['ASSETCODE'],
          settings?.value['NETWORK'],
          settings?.value['FAUCETSECRETKEY'],
          settings?.value['FUNDINGAMOUNT'],
          settings?.value['HORIZONURL']
        );
      },
      inject: [SettingsService],
    },
  ],
  controllers: [VendorsController],
  exports: [VendorsService, VendorTokenRedemptionService, ReceiveService],
})
export class VendorsModule {}
