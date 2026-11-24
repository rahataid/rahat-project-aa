import { Module } from '@nestjs/common';
import { GrievancesController } from './grievances.controller';
import { GrievancesService } from './grievances.service';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CORE_MODULE } from '../constants';
import { BullModule } from '@nestjs/bull';
import { BQUEUE } from '@rahataid/sdk';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MicroserviceAuthModule } from '@rumsan/user/ability/ms-rpc-auth';

@Module({
  imports: [
    MicroserviceAuthModule,
    EventEmitterModule.forRoot(),
    BullModule.registerQueue({
      name: BQUEUE.RAHAT,
    }),
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
  ],
  controllers: [GrievancesController],
  providers: [GrievancesService],
  exports: [GrievancesService],
})
export class GrievancesModule {}
