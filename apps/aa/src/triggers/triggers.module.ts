import { HttpModule } from '@nestjs/axios';
import { Module, forwardRef } from '@nestjs/common';
import { TriggersController } from './triggers.controller';
import { TriggersService } from './triggers.service';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '../constants';
import { PrismaModule } from '@rumsan/prisma';
import { DataSourceModule } from '../datasource/datasource.module';
import { PhasesModule } from '../phases/phases.module';

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
        name: BQUEUE.TRIGGER,
      }
    ),
    // PhasesModule
    forwardRef(() => PhasesModule),
  ],
  providers: [TriggersService],
  controllers: [TriggersController],
  exports: [TriggersService],
})
export class TriggersModule {}
