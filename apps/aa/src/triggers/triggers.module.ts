import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { PrismaModule } from '@rumsan/prisma';
import { DataSourceModule } from '../datasource/datasource.module';

@Module({
  imports: [
    PrismaModule,
    HttpModule,
    DataSourceModule,
    BullModule.registerQueue(
      {
        name: BQUEUE.SCHEDULE,
      },
      {
        name: BQUEUE.TRIGGER
      }
    )
  ],
  providers: [TriggersService],
  controllers: [TriggersController],
})
export class TriggersModule { }
