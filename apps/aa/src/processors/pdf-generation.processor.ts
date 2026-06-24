import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { BQUEUE } from '../constants';
import { QrPdfService } from '../beneficiary/qr-pdf.service';

@Processor(BQUEUE.QR_PDF)
export class PdfGenerationProcessor {
  private readonly logger = new Logger(PdfGenerationProcessor.name);

  constructor(private readonly qrPdfService: QrPdfService) {}

  @Process()
  async handle(job: Job<{ groupId: string; jobUuid: string }>) {
    this.logger.log(`Processing QR PDF job ${job.data.jobUuid} for group ${job.data.groupId}`);
    await this.qrPdfService.processQrPdf(job.data.groupId, job.data.jobUuid);
  }
}
