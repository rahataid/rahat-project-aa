import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '@rumsan/prisma';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BQUEUE } from '../constants';
import { buildQrPdf, QrCardData } from './qr-pdf-builder';

const BATCH_SIZE = 200;

function resolveEnv(key: string): string {
  return process.env[key] || '';
}

@Injectable()
export class QrPdfService {
  private readonly logger = new Logger(QrPdfService.name);
  private readonly s3: S3Client;

  constructor(
    @InjectQueue(BQUEUE.QR_PDF) private readonly qrPdfQueue: Queue,
    private readonly prisma: PrismaService
  ) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${resolveEnv('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: resolveEnv('R2_ACCESS_KEY_ID'),
        secretAccessKey: resolveEnv('R2_SECRET_ACCESS_KEY'),
      },
    });
  }

  async initiateQrPdf(groupId: string) {
    const existing = await this.prisma.pdfGenerationJob.findFirst({
      where: { groupId, status: { in: ['pending', 'processing'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      return { jobId: existing.uuid, alreadyRunning: true };
    }

    const job = await this.prisma.pdfGenerationJob.create({
      data: { groupId, status: 'pending' },
    });

    await this.qrPdfQueue.add({ groupId, jobUuid: job.uuid });

    return { jobId: job.uuid, alreadyRunning: false };
  }

  async getJobStatus(groupId: string) {
    this.logger.log(`Fetching QR PDF job status for group ${groupId}`);
    const job = await this.prisma.pdfGenerationJob.findFirst({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      select: { uuid: true, status: true, fileUrl: true, error: true, groupId: true },
    });

    if (job?.status === 'completed' && job.fileUrl) {
      const key = job.fileUrl.replace(/^https?:\/\/[^/]+\//, '');
      const signedUrl = await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: resolveEnv('R2_BUCKET'), Key: key }),
        { expiresIn: 3600 }
      );
      return { ...job, fileUrl: signedUrl };
    }

    return job;
  }

  async processQrPdf(groupId: string, jobUuid: string) {
    await this.prisma.pdfGenerationJob.update({
      where: { uuid: jobUuid },
      data: { status: 'processing' },
    });

    try {
      const cards = await this.collectCards(groupId);
      this.logger.log(`Building PDF for ${cards.length} beneficiaries in group ${groupId}`);

      const pdfBuffer = await buildQrPdf(cards);

      const key = `qr-pdfs/${groupId}/${jobUuid}.pdf`;
      this.logger.log(`Uploading PDF to R2 at key ${key}`);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: resolveEnv('R2_BUCKET'),
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        })
      );

      const fileUrl = `https://${resolveEnv('R2_PUBLIC_DOMAIN')}/${key}`;
    this.logger.log(`PDF uploaded successfully for job ${jobUuid}, updating database record`);

      await this.prisma.pdfGenerationJob.update({
        where: { uuid: jobUuid },
        data: { status: 'completed', fileUrl },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`PDF generation failed for job ${jobUuid}: ${message}`);
      await this.prisma.pdfGenerationJob.update({
        where: { uuid: jobUuid },
        data: { status: 'failed', error: message },
      });
      throw err;
    }
  }

  private async collectCards(groupId: string): Promise<QrCardData[]> {
    const cards: QrCardData[] = [];
    let skip = 0;

    while (true) {
      const rows = await this.prisma.beneficiaryToGroup.findMany({
        where: { groupId },
        include: {
          beneficiary: {
            select: { walletAddress: true, phone: true, extras: true },
          },
        },
        skip,
        take: BATCH_SIZE,
      });

      if (rows.length === 0) break;

      const walletAddresses = rows
        .map((r) => r.beneficiary?.walletAddress)
        .filter(Boolean) as string[];

      const otpMap = await this.buildOtpMap(walletAddresses);

      for (const row of rows) {
        const ben = row.beneficiary;
        if (!ben) continue;

        const extras = (ben.extras as Record<string, unknown>) || {};
        const name = this.resolveName(extras);
        const otp = otpMap[ben.walletAddress || ''] ?? '';

        cards.push({
          walletAddress: ben.walletAddress || '',
          name,
          phone: ben.phone || extras.phone as string || '',
          otp,
        });
      }

      skip += rows.length;
      if (rows.length < BATCH_SIZE) break;
    }

    return cards;
  }

  private async buildOtpMap(walletAddresses: string[]): Promise<Record<string, string>> {
    if (walletAddresses.length === 0) return {};

    const otps = await this.prisma.otp.findMany({
      where: { walletAddress: { in: walletAddresses } },
      select: { walletAddress: true, otp: true },
    });

    const map: Record<string, string> = {};
    for (const o of otps) {
      if (o.walletAddress) map[o.walletAddress] = o.otp ?? '';
    }
    return map;
  }

  private resolveName(extras: Record<string, unknown>): string {
    if (typeof extras.name === 'string' && extras.name.trim()) {
      return extras.name.trim();
    }
    const first = typeof extras.firstName === 'string' ? extras.firstName : '';
    const last = typeof extras.lastName === 'string' ? extras.lastName : '';
    return `${first} ${last}`.trim();
  }
}
