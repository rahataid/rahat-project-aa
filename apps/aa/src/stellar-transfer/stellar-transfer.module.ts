import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SettingsModule, SettingsService } from '@rumsan/settings';
import { StellarClient, StellarClientConfig } from '@rahataid/stellar';
import { BQUEUE, CORE_MODULE, STELLAR_CLIENT } from '../constants';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { StellarTransferService } from './stellar-transfer.service';
import { StellarTransferProcessor } from './stellar-transfer.processor';

@Module({
  imports: [
    SettingsModule,
    forwardRef(() => BeneficiaryModule),
    BullModule.registerQueue({ name: BQUEUE.STELLAR_TRANSFER }),
    BullModule.registerQueue({ name: BQUEUE.OFFRAMP }),
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
    StellarTransferService,
    StellarTransferProcessor,
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
  exports: [StellarTransferService],
})
export class StellarTransferModule {}
