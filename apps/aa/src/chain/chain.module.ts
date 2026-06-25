import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ChainService } from './chain.service';
import { ChainController } from './chain.controller';
import { ChainQueueService } from './chain-queue.service';
import { ChainServiceRegistry } from './registries/chain-service.registry';
import { StellarChainService } from './chain-services/stellar-chain.service';
import { EvmChainService } from './chain-services/evm-chain.service';
import { BQUEUE, CHAIN_SERVICE } from '../constants';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CORE_MODULE } from '../constants';
import { PrismaService } from '@rumsan/prisma';

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
  controllers: [ChainController],
  providers: [
    ChainService,
    { provide: CHAIN_SERVICE, useExisting: ChainService },
    ChainQueueService,
    ChainServiceRegistry,
    StellarChainService,
    EvmChainService,
    PrismaService,
  ],
  exports: [ChainService, CHAIN_SERVICE, StellarChainService],
})
export class ChainModule {}
