import { Module } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { ConnectCommunicationService } from './connect.communication';
import { CvaCommunicationService } from './communication.service';

const PROVIDERS = [
  ConnectCommunicationService,
  CvaCommunicationService,
  PrismaService,
];

@Module({
  imports: [],
  controllers: [],
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
