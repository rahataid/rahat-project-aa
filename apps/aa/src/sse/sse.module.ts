import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { SseService } from './sse.service';
import { SSE_EVENTS } from '../constants';

@Global()
@Module({
  providers: [
    {
      provide: SSE_EVENTS.PUBLISHER,
      useFactory: (config: ConfigService) =>
        new Redis({
          host: config.get('REDIS_HOST'),
          port: Number(config.get('REDIS_PORT')),
          password: config.get('REDIS_PASSWORD'),
        }),
      inject: [ConfigService],
    },
    SseService,
  ],
  exports: [SseService],
})
export class SseModule {}
