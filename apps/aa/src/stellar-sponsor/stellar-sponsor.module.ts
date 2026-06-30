import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaModule } from '@rumsan/prisma';
import { SettingsModule } from '@rumsan/settings';
import { SettingsService } from '@rumsan/settings';
import { StellarClient, StellarClientConfig } from '@rahataid/stellar';
import { BQUEUE, CORE_MODULE, STELLAR_CLIENT } from '../constants';
import { StellarSponsorService } from './stellar-sponsor.service';
import { StellarSponsorProcessor } from './stellar-sponsor.processor';

@Module({
  imports: [
    SettingsModule,
    PrismaModule,
    BullModule.registerQueue({ name: BQUEUE.STELLAR_SPONSOR }),
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
    StellarSponsorService,
    StellarSponsorProcessor,
    {
      provide: STELLAR_CLIENT,
      useFactory: async (settingsService: SettingsService) => {
        try {
          const settings = await settingsService.getPublic('STELLAR_SPONSOR_SETTINGS');
          if (!settings?.value) return null;
          return new StellarClient(settings.value as unknown as StellarClientConfig);
        } catch {
          return null;
        }
      },
      inject: [SettingsService],
    },
  ],
})
export class StellarSponsorModule {}
