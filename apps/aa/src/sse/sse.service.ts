import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CHANNELS, SSE_EVENTS } from '../constants';

@Injectable()
export class SseService {
  constructor(@Inject(SSE_EVENTS.PUBLISHER) private readonly redis: Redis) {}

  async publishEvent(event: string, data: any) {
    const message = JSON.stringify({
      event,
      data,
      timestamp: new Date().toISOString(),
    });
    await this.redis.publish(REDIS_CHANNELS.SSE_LISTENER, message);
  }
}
