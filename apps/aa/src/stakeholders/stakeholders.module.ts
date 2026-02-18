import { Module } from '@nestjs/common';
import { StakeholdersController } from './stakeholders.controller';
import { StakeholdersService } from './stakeholders.service';
import { PrismaModule } from '@rumsan/prisma';
import { StatsModule } from '../stats';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BQUEUE, TRIGGGERS_MODULE } from '../constants';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    PrismaModule,
    StatsModule,
    ClientsModule.register([
      {
        name: TRIGGGERS_MODULE,
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
  controllers: [StakeholdersController],
  providers: [StakeholdersService],
  exports: [StakeholdersService],
})
export class StakeholdersModule {}
