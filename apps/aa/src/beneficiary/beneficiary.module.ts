import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ProjectContants } from '@rahataid/sdk';
import { PrismaService } from '@rumsan/prisma';
// import { StatsModule } from '../stats/stats.module';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';
// import { BeneficiaryStatsService } from './beneficiary.stats.service';

@Module({
  imports: [
    ClientsModule.register([
      {
        name: ProjectContants.ELClient,
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: +process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
        }
      }
    ])
  ],
  controllers: [BeneficiaryController],
  providers: [BeneficiaryService, PrismaService],
  exports: [BeneficiaryService]
})
export class BeneficiaryModule { }