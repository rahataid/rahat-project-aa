import { forwardRef, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SettingsModule } from '@rumsan/settings';
import { BQUEUE, CORE_MODULE } from '../constants';
import { StellarClientProvider } from '../stellar-sponsor/stellar-client.provider';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { StellarTransferService } from './stellar-transfer.service';
import { StellarTransferProcessor } from './stellar-transfer.processor';
import { StellarTransferBatchProcessor } from './stellar-transfer-batch.processor';

@Module({
  imports: [
    SettingsModule,
    forwardRef(() => BeneficiaryModule),
    BullModule.registerQueue({ name: BQUEUE.STELLAR_TRANSFER }),
    BullModule.registerQueue({ name: BQUEUE.STELLAR_TRANSFER_BATCH }),
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
    StellarTransferBatchProcessor,
    StellarClientProvider,
  ],
  exports: [StellarTransferService],
})
export class StellarTransferModule {}
