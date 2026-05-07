import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { InkindsController } from './inkinds.controller';
import { InkindsService } from './inkinds.service';
import { OtpModule } from '../otp/otp.module';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { BQUEUE, CORE_MODULE } from '../constants';
import { BullModule } from '@nestjs/bull';
import { ChainModule } from '../chain/chain.module';
import { AppService } from '../app/app.service';

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
    BullModule.registerQueue({ name: BQUEUE.EVM_TX }),
    BullModule.registerQueue({ name: BQUEUE.EVM_QUERY }),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR,
    }),
    forwardRef(() => ChainModule),
  ],
  controllers: [InkindsController],
  providers: [InkindsService, AppService],
  exports: [InkindsService],
})
export class InkindsModule {}
/*
A circular dependency has been detected inside ProcessorsModule. 
Please, make sure that each side of a bidirectional relationships are decorated with "forwardRef()". 
Note that circular relationships between custom providers (e.g., factories) are not supported since 
functions cannot be called more than once.
*/
