import { Module } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import { CvaDisbursementService } from './disbursement.service';
import { CvaDisbursementController } from './disbursement.controller';

const PROVIDERS = [CvaDisbursementService, PrismaService];

@Module({
  imports: [],
  controllers: [CvaDisbursementController],
  providers: [...PROVIDERS],
})
export class CvaDisbursementModule {}
