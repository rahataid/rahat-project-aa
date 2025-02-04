import { Module } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { ConnectCommunicationService } from './connect.communication';
import { CvaCommunicationService } from './communication.service';
import { CvaCommunicationController } from './communication.controller';

const PROVIDERS = [
  ConnectCommunicationService,
  CvaCommunicationService,
  PrismaService,
];

@Module({
  imports: [],
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
