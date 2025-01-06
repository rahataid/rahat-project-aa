import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ProjectContants } from '@rahataid/sdk';
import { PrismaService } from '@rumsan/prisma';
import { CVaBeneficiaryController } from './beneficiary.contoller';
import { CvaBeneficiaryService } from './beneficiary.service';

const DEFAULT_PROVIDERS = [CvaBeneficiaryService, PrismaService];

@Module({
  imports: [
    ClientsModule.register([
      {
        name: ProjectContants.ELClient,
        transport: Transport.REDIS,
        options: {
          host: process.env['REDIS_HOST'] || 'localhost',
          port: parseInt(process.env['REDIS_PORT'] || '6666'),
          password: process.env['REDIS_PASSWORD'] || 'rahat123',
        },
      },
    ]),
  ],
  controllers: [CVaBeneficiaryController],
  providers: [...DEFAULT_PROVIDERS],
})
export class CvaBeneficiaryModule {}
