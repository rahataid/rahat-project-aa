import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { HttpModule } from '@nestjs/axios';
import { GroupCashTransferService } from './group-cash-transfer.service';
import { GroupCashTransferController } from './group-cash-transfer.controller';
import { GctTreasuryService } from './gct-treasury.service';
import { GctOfframpClient } from './gct-offramp.client';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BQUEUE, CORE_MODULE } from '../constants';
import { AppService } from '../app/app.service';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
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
    BullModule.registerQueue({ name: BQUEUE.COMMUNICATION }),
  ],
  controllers: [GroupCashTransferController],
  providers: [GroupCashTransferService, AppService, GctTreasuryService, GctOfframpClient],
  exports: [GroupCashTransferService],
})
export class GroupCashTransferModule {}
