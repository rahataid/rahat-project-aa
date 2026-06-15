import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { SettingsService } from '@rumsan/settings';

// Services
import { ChainQueueService } from './chain-queue.service';
import { ChainServiceRegistry } from './registries/chain-service.registry';
// TODO: STELLAR DETACH - re-enable once stellar module is rewritten and a Stellar
// chain service implementation is available again.
// import { StellarChainService } from './chain-services/stellar-chain.service';
import { EvmChainService } from './chain-services/evm-chain.service';

// Existing services that we depend on
// import { StellarService } from '../stellar/stellar.service';
// import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    // Import queue modules for both chains
    // TODO: STELLAR DETACH - BQUEUE.STELLAR no longer consumed in this module.
    BullModule.registerQueue({ name: BQUEUE.CONTRACT }),
    // Import stellar module for stellar service dependencies
    // StellarModule,
  ],
  providers: [
    SettingsService,
    ChainQueueService,
    ChainServiceRegistry,
    // StellarChainService,
    EvmChainService,
  ],
  exports: [
    ChainQueueService,
    ChainServiceRegistry,
    // StellarChainService,
    EvmChainService,
  ],
})
export class ChainQueueModule {}
