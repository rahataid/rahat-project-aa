import { Module } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { ConnectCommunicationService } from './connect.communication';
import { CvaCommunicationService } from './communication.service';
import { CvaCommunicationController } from './communication.controller';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MS_TRIGGER_CLIENTS } from '../constants';
import { BullModule } from '@nestjs/bull';
import { ProjectContants } from '@rahataid/sdk';

const PROVIDERS = [
  ConnectCommunicationService,
  CvaCommunicationService,
  PrismaService,
];

@Module({
  imports: [

  ],
  controllers: [CvaCommunicationController],
  providers: [
    ...PROVIDERS,
    {
      provide: 'COMMS_CLIENT',
      useFactory: async (commsService: ConnectCommunicationService) => {
        await commsService.init();
        return commsService.getClient();
      },
      inject: [ConnectCommunicationService],
    },
  ],
  exports: ['COMMS_CLIENT'],
})
export class CvaCommunicationModule {}
