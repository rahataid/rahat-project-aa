import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import {
  DisbursementServices,
  ReceiveService,
  TransactionService,
} from '@rahataid/stellar-sdk';
import { SettingsService } from '@rumsan/settings';

@Module({
  imports: [
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
  ],
  controllers: [StellarController],
  providers: [
    StellarService,
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
          settings?.value['HORIZONURL'],
          settings?.value['FAUCETBASEURL'],
          settings?.value['FAUCETAUTHKEY']
        );
      },
      inject: [SettingsService],
    },
    {
      provide: TransactionService,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');
        return new TransactionService(
          settings?.value['ASSETCREATOR'],
          settings?.value['ASSETCODE'],
          settings?.value['ASSETCREATORSECRET'],
          settings?.value['HORIZONURL'],
          settings?.value['NETWORK']
        );
      },
      inject: [SettingsService],
    },
    {
      provide: DisbursementServices,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');

        const disbursementValues = {
          email: settings?.value['EMAIL'],
          password: settings?.value['PASSWORD'],
          tenantName: settings?.value['TENANTNAME'],
          baseUrl: settings?.value['BASEURL'],
          adminBaseUrl: settings?.value['ADMINBASEURL'],
          assetCode: settings?.value['ASSETCODE'],
          assetIssuer: settings?.value['ASSETCREATOR'],
          assetSecret: settings?.value['ASSETCREATORSECRET'],
        };

        return new DisbursementServices(
          disbursementValues,
          settings?.value['HORIZONURL'],
          settings?.value['NETWORK']
        );
      },
      inject: [SettingsService],
    },
  ],
  exports: [
    DisbursementServices,
    StellarService,
    ReceiveService,
    TransactionService,
  ],
})
export class StellarModule {}
