import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '@rumsan/prisma';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { BQUEUE } from '../constants';
import { buildQrPdf, QrCardData } from './qr-pdf-builder';
import { AppService } from '../app/app.service';

const BATCH_SIZE = 200;

interface R2Settings {
  R2_ACCOUNT_ID: string;
  R2_ACCESS_KEY_ID: string;
  R2_SECRET_ACCESS_KEY: string;
  R2_BUCKET: string;
  R2_PUBLIC_DOMAIN: string;
}

@Injectable()
export class QrPdfService implements OnModuleInit {
  private readonly logger = new Logger(QrPdfService.name);
  private s3: S3Client;
  private r2: R2Settings;

  constructor(
    @InjectQueue(BQUEUE.QR_PDF) private readonly qrPdfQueue: Queue,
    private readonly prisma: PrismaService
  ) {}

  async onModuleInit() {
    const setting = await this.prisma.setting.findUniqueOrThrow({
      where: { name: 'CLOUDFLARE_R2' },
    });
    this.r2 = setting.value as unknown as R2Settings;
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${this.r2.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: this.r2.R2_ACCESS_KEY_ID,
        secretAccessKey: this.r2.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async initiateQrPdf(groupId: string) {
    const existing = await this.prisma.pdfGenerationJob.findFirst({
      where: { groupId, status: { in: ['pending', 'processing'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      this.logger.log(`QR PDF job already running for group ${groupId}`);
      return { jobId: existing.uuid, alreadyRunning: true };
    }

    const job = await this.prisma.pdfGenerationJob.create({
      data: { groupId, status: 'pending' },
    });

    await this.qrPdfQueue.add({ groupId, jobUuid: job.uuid });
    this.logger.log(`QR PDF generation queued for group ${groupId}`);

    return { jobId: job.uuid, alreadyRunning: false };
  }

  async getJobStatus(groupId: string) {
    this.logger.log(`Fetching QR PDF job status for group ${groupId}`);
    const job = await this.prisma.pdfGenerationJob.findFirst({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      select: {
        uuid: true,
        status: true,
        fileUrl: true,
        error: true,
        groupId: true,
      },
    });

    if (job?.status === 'completed' && job.fileUrl) {
      const key = job.fileUrl.replace(/^https?:\/\/[^/]+\//, '');
      const signedUrl = await getSignedUrl(
        this.s3,
        new GetObjectCommand({ Bucket: this.r2.R2_BUCKET, Key: key }),
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
      this.logger.log(
        `Building PDF for ${cards.length} beneficiaries in group ${groupId}`
      );

      const pdfBuffer = await buildQrPdf(cards);

      const key = `qr-pdfs/${groupId}/${jobUuid}.pdf`;
      this.logger.log(`Uploading PDF to R2 at key ${key}`);
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.r2.R2_BUCKET,
          Key: key,
          Body: pdfBuffer,
          ContentType: 'application/pdf',
        })
      );

      const fileUrl = `https://${this.r2.R2_PUBLIC_DOMAIN}/${key}`;
      this.logger.log(
        `PDF uploaded successfully for job ${jobUuid}, updating database record`
      );

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
    this.logger.log(`Collecting beneficiaries for group ${groupId}`);
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

        const isRandom =
          extras.isRandomNumber === true || extras.isRandomNumber === 'true';
        const rawPhone = ben.phone || (extras.phone as string) || '';
        const phone = isRandom
          ? undefined
          : (rawPhone.startsWith('+977') ? rawPhone.slice(4) : rawPhone) ||
            undefined;

        const ward =
          extras.ward_no != null ? String(extras.ward_no) : undefined;
        const location =
          typeof extras.tole_name === 'string' && extras.tole_name.trim()
            ? extras.tole_name.trim()
            : undefined;
        const district =
          typeof extras.district === 'string' && extras.district.trim()
            ? extras.district.trim()
            : undefined;

        const govIdType =
          typeof extras.interviewee_government_id_type === 'string' &&
          extras.interviewee_government_id_type.trim()
            ? extras.interviewee_government_id_type.trim()
            : undefined;
        const govIdNumber =
          typeof extras.ssa_id_number === 'string' &&
          extras.ssa_id_number.trim()
            ? extras.ssa_id_number.trim()
            : undefined;

        cards.push({
          walletAddress: ben.walletAddress || '',
          name,
          phone,
          otp,
          ward,
          location,
          district,
          governmentIdType: govIdType,
          governmentIdNumber: govIdNumber,
        });
      }

      skip += rows.length;
      if (rows.length < BATCH_SIZE) break;
    }

    return cards;
  }

  private async buildOtpMap(
    walletAddresses: string[]
  ): Promise<Record<string, string>> {
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
