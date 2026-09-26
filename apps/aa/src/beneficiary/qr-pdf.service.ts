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
import { BQUEUE, QR_PDF_MAX_FIELDS } from '../constants';
import { buildQrPdf, QrCardData } from './qr-pdf-builder';
import { AppService } from '../app/app.service';
import { GenerateQrPdfDto, RegenerateQrPdfDto } from './dto/qr-pdf.dto';

const BATCH_SIZE = 200;

// Turns an arbitrary field token ("NAME", "tole_name") into a readable
// label ("Name", "Tole Name").
function toLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Case-insensitively finds `field` among the beneficiary's extras keys
// and returns its value, or undefined if extras has no matching key.
function findExtraValue(
  extras: Record<string, unknown>,
  field: string
): unknown {
  const key = Object.keys(extras).find(
    (k) => k.toLowerCase() === field.toLowerCase()
  );
  return key ? extras[key] : undefined;
}

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

  async initiateQrPdf(payload: GenerateQrPdfDto) {
    const {
      groupId,
      includeOtp = true,
      excludeUnphonedBeneficiaries = false,
      pdfFields = [],
    } = payload;

    this.assertPdfFieldsWithinLimit(pdfFields);

    const existing = await this.prisma.pdfGenerationJob.findFirst({
      where: { groupId, status: { in: ['pending', 'processing'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      this.logger.log(`QR PDF job already running for group ${groupId}`);
      return { jobId: existing.uuid, alreadyRunning: true };
    }

    return this.enqueueQrPdfJob(
      groupId,
      includeOtp,
      excludeUnphonedBeneficiaries,
      pdfFields
    );
  }

  // Removes any previous PDF generation job record for the group and
  // starts a fresh generation job with the given payload. Refuses if a job
  // for the group is still pending/processing instead of racing with it.
  async regenerateQrPdf(payload: RegenerateQrPdfDto) {
    const {
      groupId,
      includeOtp = true,
      excludeUnphonedBeneficiaries = false,
      pdfFields = [],
    } = payload;

    this.assertPdfFieldsWithinLimit(pdfFields);

    const lastJob = await this.prisma.pdfGenerationJob.findFirst({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
    });

    if (lastJob && ['pending', 'processing'].includes(lastJob.status)) {
      throw new Error(
        `QR PDF generation is already in progress for group ${groupId}; ` +
          'wait for it to finish before regenerating.'
      );
    }

    if (lastJob) {
      this.logger.log(
        `Removing previous QR PDF job ${lastJob.uuid} for group ${groupId}`
      );
      await this.prisma.pdfGenerationJob.delete({
        where: { uuid: lastJob.uuid },
      });
    }

    return this.enqueueQrPdfJob(
      groupId,
      includeOtp,
      excludeUnphonedBeneficiaries,
      pdfFields
    );
  }

  private assertPdfFieldsWithinLimit(pdfFields: string[]) {
    if (pdfFields.length > QR_PDF_MAX_FIELDS) {
      throw new Error(
        `pdfFields supports at most ${QR_PDF_MAX_FIELDS} fields, got ${pdfFields.length}`
      );
    }
  }

  private async enqueueQrPdfJob(
    groupId: string,
    includeOtp: boolean,
    excludeUnphonedBeneficiaries: boolean,
    pdfFields: string[]
  ) {
    const withOtp = includeOtp !== false;

    const job = await this.prisma.pdfGenerationJob.create({
      data: { groupId, status: 'pending' },
    });

    await this.qrPdfQueue.add({
      groupId,
      jobUuid: job.uuid,
      includeOtp: withOtp,
      excludeUnphonedBeneficiaries,
      pdfFields,
    });
    this.logger.log(
      `QR PDF generation queued for group ${groupId} (includeOtp=${withOtp}, ` +
        `excludeUnphonedBeneficiaries=${excludeUnphonedBeneficiaries}, pdfFields=${pdfFields.join(',')})`
    );

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

  async processQrPdf(
    groupId: string,
    jobUuid: string,
    includeOtp = true,
    excludeUnphonedBeneficiaries = false,
    pdfFields: string[] = []
  ) {
    const withOtp = includeOtp !== false;
    await this.prisma.pdfGenerationJob.update({
      where: { uuid: jobUuid },
      data: { status: 'processing' },
    });

    try {
      const cards = await this.collectCards(
        groupId,
        withOtp,
        excludeUnphonedBeneficiaries,
        pdfFields
      );
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

  private async collectCards(
    groupId: string,
    includeOtp = true,
    excludeUnphonedBeneficiaries = false,
    pdfFields: string[] = []
  ): Promise<QrCardData[]> {
    const withOtp = includeOtp !== false;
    this.logger.log(
      `Collecting beneficiaries for group ${groupId} (includeOtp=${withOtp}, ` +
        `excludeUnphonedBeneficiaries=${excludeUnphonedBeneficiaries}, pdfFields=${pdfFields.join(',')})`
    );
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

      // when OTP is excluded, skip the OTP lookup entirely
      // so no PIN is rendered into the PDF.
      const otpMap = withOtp ? await this.buildOtpMap(walletAddresses) : {};

      for (const row of rows) {
        const ben = row.beneficiary;
        if (!ben) continue;

        const extras = (ben.extras as Record<string, unknown>) || {};
        const name = this.resolveName(extras);
        const otp = withOtp ? otpMap[ben.walletAddress || ''] ?? '' : '';

        const rawPhone = ben.phone || (extras.phone as string) || '';
        const isRandomPhone = rawPhone.startsWith('+000');

        // random/placeholder phone numbers are never displayed, and the
        // whole beneficiary is dropped when explicitly excluded.
        if (isRandomPhone && excludeUnphonedBeneficiaries) continue;

        const phone = isRandomPhone
          ? undefined
          : (rawPhone.startsWith('+977') ? rawPhone.slice(4) : rawPhone) ||
            undefined;

        // pdfFields is a dynamic, arbitrary list of tokens matched
        // case-insensitively against this beneficiary's own extras keys;
        // a token with no matching key (or an empty value) is dropped.
        const extraFields: { label: string; value: string }[] = [];
        for (const field of pdfFields) {
          const value = findExtraValue(extras, field);
          if (value === undefined || value === null) continue;
          const strValue = String(value).trim();
          if (!strValue) continue;
          extraFields.push({ label: toLabel(field), value: strValue });
        }

        cards.push({
          walletAddress: ben.walletAddress || '',
          name,
          phone,
          otp,
          extraFields,
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
