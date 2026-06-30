import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ChainService } from './chain.service';
import { ChainController } from './chain.controller';
import { ChainQueueService } from './chain-queue.service';
import { ChainServiceRegistry } from './registries/chain-service.registry';
// TODO: STELLAR DETACH - re-enable once stellar module is rewritten and a Stellar
// chain service implementation is available again.
// import { StellarChainService } from './chain-services/stellar-chain.service';
import { EvmChainService } from './chain-services/evm-chain.service';
import { BQUEUE, CHAIN_SERVICE } from '../constants';
// import { StellarModule } from '../stellar/stellar.module';
import { ClientsModule } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { CORE_MODULE } from '../constants';
import { PrismaService } from '@rumsan/prisma';
// import { ReceiveService } from '@rahataid/stellar-sdk';
// import { SettingsService } from '@rumsan/settings';

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
    // TODO: STELLAR DETACH - no longer consumed in this module.
    // BullModule.registerQueue({
    //   name: BQUEUE.STELLAR,
    // }),
    BullModule.registerQueue({
      name: BQUEUE.CONTRACT,
    }),
    BullModule.registerQueue({ name: BQUEUE.EVM_TX }),
    BullModule.registerQueue({ name: BQUEUE.EVM_QUERY }),
    // StellarModule,
  ],
  controllers: [ChainController],
  providers: [
    ChainService,
    { provide: CHAIN_SERVICE, useExisting: ChainService },
    ChainQueueService,
    ChainServiceRegistry,
    // TODO: STELLAR DETACH - re-register a Stellar chain service implementation
    // here once the stellar module is rewritten.
    // StellarChainService,
    EvmChainService,
    PrismaService,
    // TODO: STELLAR DETACH - re-add once ReceiveService-equivalent is available.
    // {
    //   provide: ReceiveService,
    //   useFactory: async (settingService: SettingsService) => {
    //     const settings = await settingService.getPublic('STELLAR_SETTINGS');
    //     return new ReceiveService(
    //       settings?.value['ASSETCREATOR'] || '',
    //       settings?.value['ASSETCODE'] || '',
    //       settings?.value['NETWORK'] || '',
    //       settings?.value['FAUCETSECRETKEY'] || '',
    //       settings?.value['FUNDINGAMOUNT'] || 0,
    //       settings?.value['HORIZONURL'] || ''
    //     );
    //   },
    //   inject: [SettingsService],
    // },
  ],
  exports: [ChainService, CHAIN_SERVICE],
})
export class ChainModule {}
