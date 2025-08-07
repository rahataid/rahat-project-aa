import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';
import { StatsModule } from '../stats';
import { BeneficiaryStatService } from './beneficiaryStat.service';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    StellarModule,
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
    StatsModule,
    BullModule.registerQueue({
      name: BQUEUE.CONTRACT,
    }),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR,
    }),
  ],
  controllers: [BeneficiaryController],
  providers: [BeneficiaryService, PrismaService, BeneficiaryStatService],
  exports: [BeneficiaryService, BeneficiaryStatService],
})
export class BeneficiaryModule {}
