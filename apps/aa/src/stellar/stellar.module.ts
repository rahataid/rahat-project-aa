import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import {
  DisbursementService,
  TransactionService,
  AuthService,
} from '@rahataid/stellar-sdk-v2';
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
      provide: AuthService,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');
        return new AuthService({
          email: settings?.value['EMAIL'],
          password: settings?.value['PASSWORD'],
          tenantName: settings?.value['TENANTNAME'],
          baseUrl: settings?.value['BASEURL'],
        });
      },
      inject: [SettingsService],
    },
    {
      provide: TransactionService,
      useFactory: async (
        authService: AuthService,
        settingService: SettingsService
      ) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');
        return new TransactionService(
          authService,
          settings?.value['ASSETCREATOR'],
          settings?.value['ASSETCODE'],
          settings?.value['ASSETCREATORSECRET'],
          settings?.value['HORIZONURL'],
          settings?.value['NETWORK']
        );
      },
      inject: [AuthService, SettingsService],
    },
    {
      provide: DisbursementService,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');
        return new DisbursementService({
          email: settings?.value['EMAIL'],
          password: settings?.value['PASSWORD'],
          tenantName: settings?.value['TENANTNAME'],
          baseUrl: settings?.value['BASEURL'],
          assetCode: settings?.value['ASSETCODE'],
          assetIssuer: settings?.value['ASSETCREATOR'],
          assetSecret: settings?.value['ASSETCREATORSECRET'],
          horizonServer: settings?.value['HORIZONURL'],
          network: settings?.value['NETWORK'],
        });
      },
      inject: [SettingsService],
    },
  ],
  exports: [DisbursementService, StellarService, TransactionService],
})
export class StellarModule {}
