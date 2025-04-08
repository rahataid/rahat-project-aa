import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';
import { StatsModule } from '../stats';
import { BeneficiaryStatService } from './beneficiaryStat.service';
import { CvaDisbursementService } from '@rahat-project/cva';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { StellarService } from '../stellar/stellar.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'RAHAT_CLIENT',
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
  ],
  controllers: [BeneficiaryController],
  providers: [
    BeneficiaryService,
    PrismaService,
    BeneficiaryStatService,
    CvaDisbursementService,
    StellarService,
  ],
  exports: [BeneficiaryService],
})
export class BeneficiaryModule {}
