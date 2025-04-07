import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';
import { StatsModule } from '../stats';
import { BeneficiaryStatService } from './beneficiaryStat.service';
import { StellarService } from '../stellar/stellar.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: 'RAHAT_CORE_PROJECT_CLIENT',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: +process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
        },
      },
    ]),
    StatsModule,
  ],
  controllers: [BeneficiaryController],
  providers: [
    BeneficiaryService,
    PrismaService,
    BeneficiaryStatService,
    StellarService,
  ],
  exports: [BeneficiaryService],
})
export class BeneficiaryModule {}
