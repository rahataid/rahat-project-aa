import { Module } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarController } from './stellar.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import { SettingsService } from '@rumsan/settings';
import { SdkConfigManager } from '@rahataid/stellar-sdk';

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
  ],
  controllers: [StellarController],
  providers: [
    StellarService,
    {
      provide: 'STELLAR_SDK_CONFIG',
      useFactory: async (settingsService: SettingsService) => {
        const settings = await settingsService.getPublic('STELLAR_SETTINGS');
        const config = {
          processUrl: settings?.value['DEMOWALLET'],
          receiverUrl: settings?.value['RECEIVERBASEURL'],
          baseUrl: settings?.value['BASEURL'],
          adminBaseUrl: settings?.value['ADMINBASEURL'],
          friendbotUrl: settings?.value['FRIENDBOTURL'],
        };

        const configManager = SdkConfigManager.getInstance();
        configManager.initialize(config);

        return config;
      },
      inject: [SettingsService],
    },
  ],
})
export class StellarModule {}
