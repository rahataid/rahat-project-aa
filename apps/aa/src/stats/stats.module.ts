import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { TRIGGGERS_MODULE } from '../constants';

@Module({
  imports: [
    PrismaModule,
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
  ],
  controllers: [StatsController],
  providers: [StatsService],
  exports: [StatsService],
})
export class StatsModule {}
