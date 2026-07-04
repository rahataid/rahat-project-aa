import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { GroupCashTransferService } from './group-cash-transfer.service';
import { GroupCashTransferController } from './group-cash-transfer.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BQUEUE, CORE_MODULE } from '../constants';
import { AppService } from '../app/app.service';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    PrismaModule,
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
  providers: [GroupCashTransferService, AppService],
  exports: [GroupCashTransferService],
})
export class GroupCashTransferModule {}
