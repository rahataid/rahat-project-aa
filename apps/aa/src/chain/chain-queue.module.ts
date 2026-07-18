import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BQUEUE, CORE_MODULE } from '../constants';
import { SettingsService } from '@rumsan/settings';
import { PrismaService } from '@rumsan/prisma';

import { ChainQueueService } from './chain-queue.service';
import { ChainServiceRegistry } from './registries/chain-service.registry';
import { StellarChainService } from './chain-services/stellar-chain.service';
import { EvmChainService } from './chain-services/evm-chain.service';

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
    BullModule.registerQueue({ name: BQUEUE.CONTRACT }),
    BullModule.registerQueue({ name: BQUEUE.EVM_TX }),
    BullModule.registerQueue({ name: BQUEUE.EVM_QUERY }),
    BullModule.registerQueue({ name: BQUEUE.STELLAR_SDP }),
  ],
  providers: [
    PrismaService,
    SettingsService,
    ChainQueueService,
    ChainServiceRegistry,
    StellarChainService,
    EvmChainService,
  ],
  exports: [
    ChainQueueService,
    ChainServiceRegistry,
    StellarChainService,
    EvmChainService,
  ],
})
export class ChainQueueModule {}
