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
  ],
  controllers: [StellarController],
  providers: [
    StellarService,
    {
      provide: ReceiveService,
      useValue: new ReceiveService(),
    },
    {
      provide: TransactionService,
      useValue: new TransactionService(),
    },
    {
      provide: DisbursementServices,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');
        const email = settings?.value['EMAIL'];
        const password = settings?.value['PASSWORD'];
        const tenantName = settings?.value['TENANTNAME'];

        return new DisbursementServices(email, password, tenantName);
      },
      inject: [SettingsService],
    },
  ],
  exports: [DisbursementServices, StellarService],
})
export class StellarModule {}
