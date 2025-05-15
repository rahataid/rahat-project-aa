import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { VendorsService } from '../vendors/vendors.service';
@Module({
  imports: [
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
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService, PrismaService, VendorsService],
  exports: [PayoutsService],
})
export class PayoutsModule {} 