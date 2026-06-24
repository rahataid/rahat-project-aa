import { forwardRef, Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { BeneficiaryController } from './beneficiary.controller';
import { BeneficiaryService } from './beneficiary.service';
import { StatsModule } from '../stats';
import { BeneficiaryStatService } from './beneficiaryStat.service';
import { BullModule } from '@nestjs/bull';
import { BQUEUE, CORE_MODULE } from '../constants';
import { StellarModule } from '../stellar/stellar.module';
import { SettingsModule } from '@rumsan/settings';
import { BeneficiaryMultisigService } from './beneficiary.multisig.service';
import { PayoutsModule } from '../payouts/payouts.module';
import { QrPdfService } from './qr-pdf.service';
import { PdfGenerationProcessor } from '../processors/pdf-generation.processor';

@Module({
  imports: [
    forwardRef(() => PayoutsModule),
    StellarModule,
    SettingsModule,
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
    StatsModule,
    BullModule.registerQueue({
      name: BQUEUE.CONTRACT,
    }),
    BullModule.registerQueue({
      name: BQUEUE.STELLAR,
    }),
    BullModule.registerQueue({
      name: BQUEUE.QR_PDF,
    }),
  ],
  controllers: [BeneficiaryController],
  providers: [
    BeneficiaryService,
    PrismaService,
    BeneficiaryStatService,
    BeneficiaryMultisigService,
    QrPdfService,
    PdfGenerationProcessor,
  ],
  exports: [BeneficiaryService, BeneficiaryStatService, QrPdfService],
})
export class BeneficiaryModule {}
