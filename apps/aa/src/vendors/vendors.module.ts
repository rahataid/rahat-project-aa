import { Module, forwardRef } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { VendorsService } from './vendors.service';
import { VendorsController } from './vendors.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { CORE_MODULE } from '../constants';
import { ReceiveService } from '@rahataid/stellar-sdk';

@Module({
  imports: [
    PrismaModule,
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
  providers: [
    VendorsService,
    {
      provide: ReceiveService,
      useValue: new ReceiveService(),
    },
  ],
  controllers: [VendorsController],
  exports: [VendorsService, ReceiveService],
})
export class VendorsModule {}
