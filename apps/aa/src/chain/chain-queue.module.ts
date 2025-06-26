import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { SettingsService } from '@rumsan/settings';

// Services
import { ChainQueueService } from './chain-queue.service';
import { ChainServiceRegistry } from './registries/chain-service.registry';
import { StellarChainService } from './chain-services/stellar-chain.service';
import { EvmChainService } from './chain-services/evm-chain.service';

// Existing services that we depend on
import { StellarService } from '../stellar/stellar.service';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    // Import queue modules for both chains
    BullModule.registerQueue({ name: BQUEUE.STELLAR }, { name: BQUEUE.EVM }),
    // Import stellar module for stellar service dependencies
    StellarModule,
  ],
  providers: [
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
