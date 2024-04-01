import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ListenersModule } from '../listeners/listeners.module';
import { ScheduleModule } from '../schedule/schedule.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ScheduleModule,
    EventEmitterModule.forRoot({ maxListeners: 10, ignoreErrors: false }),
    ListenersModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
