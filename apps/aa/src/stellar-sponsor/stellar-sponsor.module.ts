import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaModule } from '@rumsan/prisma';
import { SettingsModule } from '@rumsan/settings';
import { BQUEUE, CORE_MODULE } from '../constants';
import { StellarClientProvider, stellarClientCompatProvider } from './stellar-client.provider';
import { StellarSponsorService } from './stellar-sponsor.service';
import { StellarSponsorProcessor } from './stellar-sponsor.processor';

@Module({
  imports: [
    SettingsModule,
    PrismaModule,
    BullModule.registerQueue({ name: BQUEUE.STELLAR_SPONSOR }),
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
    StellarSponsorService,
    StellarSponsorProcessor,
    StellarClientProvider,
    stellarClientCompatProvider,
  ],
})
export class StellarSponsorModule {}
