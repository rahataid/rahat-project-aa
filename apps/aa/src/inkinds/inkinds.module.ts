import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { InkindsController } from './inkinds.controller';
import { InkindsService } from './inkinds.service';
import { OtpModule } from '../otp/otp.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BQUEUE, CORE_MODULE } from '../constants';
import { BullModule } from '@nestjs/bull';

@Module({
  imports: [
    PrismaModule,
    OtpModule,
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
    BullModule.registerQueue({
      name: BQUEUE.EVM,
    }),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR,
    }),
  ],
  controllers: [InkindsController],
  providers: [InkindsService],
  exports: [InkindsService],
})
export class InkindsModule {}
