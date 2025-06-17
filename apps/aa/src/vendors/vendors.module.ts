import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CORE_MODULE } from '../constants';
import { ReceiveService } from '@rahataid/stellar-sdk';
import { SettingsService } from '@rumsan/settings';

@Module({
  imports: [
    PrismaModule,
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
    {
      provide: ReceiveService,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');

        return new ReceiveService(
          settings?.value['ASSETCREATOR'],
          settings?.value['ASSETCODE'],
          settings?.value['NETWORK'],
          settings?.value['FAUCETSECRETKEY'],
          settings?.value['FUNDINGAMOUNT']
        );
      },
      inject: [SettingsService],
    },
  ],
  controllers: [VendorsController],
  exports: [VendorsService, ReceiveService],
})
export class VendorsModule {}
