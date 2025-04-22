import { Module } from '@nestjs/common';
import { DepositService } from './deposit.service';
import { DepositController } from './deposit.controller';
import { ConfigService, ConfigModule } from '@nestjs/config';
import Redis from 'ioredis';

@Module({
  imports: [ConfigModule],
  controllers: [DepositController],
  providers: [
    DepositService,
    {
      provide: 'REDIS_CLIENT',
      useFactory: (configService: ConfigService) => {
        const client = new Redis({
          host: configService.get<string>('REDIS_HOST'),
          port: configService.get<number>('REDIS_PORT'),
          password: configService.get<string>('REDIS_PASSWORD'),
        });
        client.on('error', (err) => console.error('Redis Client Error', err));
        return client;
      },
      inject: [ConfigService],
    },
  ],
})
export class DepositModule {}
