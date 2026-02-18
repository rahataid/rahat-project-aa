import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { PayoutsController } from './payouts.controller';
import { PayoutsService } from './payouts.service';
import { BQUEUE, CORE_MODULE } from '../constants';
import { VendorsModule } from '../vendors/vendors.module';
import { AppService } from '../app/app.service';
import { HttpModule} from '@nestjs/axios';
import { OfframpService } from './offramp.service';
import { BullModule } from '@nestjs/bull';
import { BeneficiaryModule } from '../beneficiary/beneficiary.module';
import { StellarModule } from '../stellar/stellar.module';

@Module({
  imports: [
    VendorsModule,
    HttpModule,
    BeneficiaryModule,
    StellarModule,
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
    BullModule.registerQueue({
      name: BQUEUE.STELLAR,
    }),
    BullModule.registerQueue({
      name: BQUEUE.OFFRAMP,
    }),
    BullModule.registerQueue({
      name: BQUEUE.BATCH_TRANSFER,
    }),
  ],
  controllers: [PayoutsController],
  providers: [PayoutsService, PrismaService, AppService, OfframpService],
  exports: [PayoutsService, OfframpService, AppService,PrismaService],
})
export class PayoutsModule {}
