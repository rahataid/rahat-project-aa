import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { CORE_MODULE } from '../constants';
import { VendorsModule } from '../vendors/vendors.module';
@Module({
  imports: [
    VendorsModule,
    ClientsModule.register([
      {
        name: 'RAHAT_CLIENT',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST,
          port: +process.env.REDIS_PORT,
          password: process.env.REDIS_PASSWORD,
        },
      },
    ]),
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
  controllers: [PayoutsController],
  providers: [PayoutsService, PrismaService],
  exports: [PayoutsService],
})
export class PayoutsModule {}
