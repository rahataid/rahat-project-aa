import { Module } from '@nestjs/common';
import { PrismaModule } from '@rumsan/prisma';
import { CvaDisbursementService } from './disbursement.service';
import { CvaDisbursementController } from './disbursement.controller';

const PROVIDERS = [CvaDisbursementService];

@Module({
  imports: [PrismaModule],
  controllers: [CvaDisbursementController],
  providers: [...PROVIDERS],
})
export class CvaDisbursementModule {}
