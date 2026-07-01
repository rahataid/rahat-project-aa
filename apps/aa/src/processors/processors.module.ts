import { forwardRef, Module } from '@nestjs/common';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { PrismaService } from '@rumsan/prisma';
import { ContractProcessor } from './contract.processor';
import { StatsProcessor } from './stats.processor';
import { SdpStellarProcessor } from './sdp-stellar.processor';
import { OfframpProcessor } from './offramp.processor';
import { ManualPayoutProcessor } from './manual-payout.processor';
import { BatchTokenTransferProcessor } from './batch-token-transfer.processor';
import { VendorOfflinePayoutProcessor } from './vendor-cva-payout.processor';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import { PayoutsModule } from '../payouts/payouts.module';
import { StakeholdersModule } from '../stakeholders/stakeholders.module';
import { NotificationProcessor } from './notification.processor';
import { EVMCentralizedProcessor } from './evm-centralized.processor';
import { InkindsModule } from '../inkinds';
import { EVMTxDispatcher, EVMQueryDispatcher } from '../dispatcher/evm.dispatcher';
import { InkindProcessor } from './inkind.processor';
import { OtpModule } from '../otp/otp.module';
import { ChainModule } from '../chain/chain.module';

@Module({
  imports: [
    BeneficiaryModule,
    forwardRef(() => InkindsModule),
    PayoutsModule,
    StakeholdersModule,
    ChainModule,
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
    BullModule.registerQueue({ name: BQUEUE.STELLAR_SDP }),
    BullModule.registerQueue({
      name: BQUEUE.OFFRAMP,
    }),
    BullModule.registerQueue({
      name: BQUEUE.MANUAL_PAYOUT,
    }),
    BullModule.registerQueue({
      name: BQUEUE.VENDOR_CVA,
    }),
    BullModule.registerQueue({
      name: BQUEUE.BATCH_TRANSFER,
    }),
    BullModule.registerQueue({
      name: BQUEUE.EVM_TX,
      settings: {
        maxStalledCount: 3,
        lockDuration: 600000,
        lockRenewTime: 300000,
      },
    }),
    BullModule.registerQueue({
      name: BQUEUE.EVM_QUERY,
      settings: {
        maxStalledCount: 3,
        lockDuration: 60000,
        lockRenewTime: 30000,
      },
    }),
    BullModule.registerQueue({ name: BQUEUE.COMMUNICATION }),
    OtpModule,
  ],
  providers: [
    PrismaService,
    ContractProcessor,
    InkindProcessor,
    StatsProcessor,
    SdpStellarProcessor,
    NotificationProcessor,
    OfframpProcessor,
    ManualPayoutProcessor,
    VendorOfflinePayoutProcessor,
    BatchTokenTransferProcessor,
    EVMCentralizedProcessor,
    EVMTxDispatcher,
    EVMQueryDispatcher,
  ],
  exports: [EVMCentralizedProcessor, EVMTxDispatcher, EVMQueryDispatcher, ContractProcessor],
})
export class ProcessorsModule {}
