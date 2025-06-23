import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ChainService } from './chain.service';
import { ChainController } from './chain.controller';
import { ChainQueueService } from './chain-queue.service';
import { ChainServiceRegistry } from './registries/chain-service.registry';
import { StellarChainService } from './chain-services/stellar-chain.service';
import { EVMChainService } from './chain-services/evm-chain.service';
import { BQUEUE } from '../constants';
import { StellarModule } from '../stellar/stellar.module';
import { ClientsModule } from '@nestjs/microservices';
import { Transport } from '@nestjs/microservices';
import { CORE_MODULE } from '../constants';
import { PrismaService } from '@rumsan/prisma';
import { ReceiveService } from '@rahataid/stellar-sdk';
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
    BullModule.registerQueue({
      name: BQUEUE.CONTRACT,
    }),
    StellarModule,
  ],
  controllers: [ChainController],
  providers: [
    ChainService,
    ChainQueueService,
    ChainServiceRegistry,
    StellarChainService,
    EVMChainService,
    PrismaService,
    {
      provide: ReceiveService,
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');
        return new ReceiveService(
          settings?.value['ASSETCREATOR'] || '',
          settings?.value['ASSETCODE'] || '',
          settings?.value['NETWORK'] || '',
          settings?.value['FAUCETSECRETKEY'] || '',
          settings?.value['FUNDINGAMOUNT'] || 0
        );
      },
      inject: [SettingsService],
    },
  ],
})
export class ChainModule {}
