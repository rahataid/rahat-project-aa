import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { getClient } from '@rumsan/connect/src/clients';
import * as nodemailer from 'nodemailer';

const GET_COMMUNICATION_SETTINGS = 'appJobs.communication.getSettings';
const GET_SMTP_SETTINGS = 'appJobs.smtp.getSettings';
const GET_FRONTEND_URL = 'appJobs.frontendUrl.get';
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;
const TIMEOUT_MS = 5000;

export type CommsClient = ReturnType<typeof getClient>;

@Injectable()
export class CommsService {
  private client: CommsClient;
  private logger = new Logger(CommsService.name);
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;
  private retryCount = 0;

  private emailTransporter: nodemailer.Transporter | null = null;
  private emailFrom: string | null = null;

  constructor(
    @Inject('CORE_CLIENT') private readonly coreClient: ClientProxy
  ) {}

  async init() {
    if (this.isInitializing) {
      return this.initializationPromise;
    }

    this.isInitializing = true;
    this.initializationPromise = this.attemptInitialization();
    return this.initializationPromise;
  }

  private async attemptInitialization(): Promise<void> {
    try {
      const [communicationSettings] = await lastValueFrom(
        this.coreClient
          .send({ cmd: GET_COMMUNICATION_SETTINGS }, {})
          .pipe(timeout(TIMEOUT_MS))
      );

      if (!communicationSettings) {
        throw new Error('Communication settings not found in response');
      }

      this.client = getClient({
        baseURL: communicationSettings.value['URL'],
      });
      this.client.setAppId(communicationSettings.value['APP_ID']);

      this.logger.log('Comms Service initialized successfully');
      this.retryCount = 0;
      this.isInitializing = false;
    } catch (error) {
      this.isInitializing = false;
      this.handleInitializationError(error);
    }
  }

  private handleInitializationError(error: any): void {
    this.retryCount++;
    const delay = this.calculateRetryDelay();

    this.logger.warn(
      `Failed to initialize Comms Service (attempt ${this.retryCount}). ` +
        `Error: ${error.message || 'Unknown error'}. ` +
        `Retrying in ${delay / 1000} seconds...`
    );

    setTimeout(() => {
      this.logger.log(
        `Retry attempt ${this.retryCount} for Comms Service initialization`
      );
      this.init();
    }, delay);
  }

  private calculateRetryDelay(): number {
    const exponentialDelay =
      INITIAL_RETRY_DELAY_MS * Math.pow(2, this.retryCount - 1);
    return Math.min(exponentialDelay, MAX_RETRY_DELAY_MS);
  }

  async getClient(): Promise<any> {
    if (!this.client) {
      if (!this.isInitializing) {
        await this.init();
      }

      if (!this.client) {
        this.logger.warn(
          'Comms client is not available yet. Service is still initializing. ' +
            'Please try again later or check if the communication broker is accessible.'
        );
      }
    }
    return this.client;
  }

  private async initEmailTransporter(): Promise<void> {
    if (this.emailTransporter) return;

    const [smtpSettings] = await lastValueFrom(
      this.coreClient
        .send({ cmd: GET_SMTP_SETTINGS }, {})
        .pipe(timeout(TIMEOUT_MS))
    );

    if (!smtpSettings) {
      throw new Error('SMTP settings not found in response');
    }

    const { value } = smtpSettings;
    this.emailFrom = value['USERNAME'];
    this.emailTransporter = nodemailer.createTransport({
      pool: true,
      host: value['HOST'],
      port: value['PORT'],
      secure: value['SECURE'],
      auth: {
        user: value['USERNAME'],
        pass: value['PASSWORD'],
      },
    });

    this.logger.log('Email transporter initialized successfully');
  }

  async sendEmail(
    to: string | string[],
    subject: string,
    text: string,
    html?: string
  ): Promise<void> {
    await this.initEmailTransporter();

    this.logger.log(`Sending email to ${to} with subject "${subject}"`);
    try {
      const info = await this.emailTransporter!.sendMail({
        from: this.emailFrom!,
        to,
        subject,
        text,
        html,
      });

      this.logger.log(
        `Email sent to ${to}: messageId=${info.messageId}, response=${info.response}`
      );
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw error;
    }
  }

  async getFrontendUrl(): Promise<string> {
    const [frontendSetting] = await lastValueFrom(
      this.coreClient
        .send({ cmd: GET_FRONTEND_URL }, {})
        .pipe(timeout(TIMEOUT_MS))
    );

    // FRONTEND_URL setting stores the url string directly in value
    return frontendSetting?.value ?? '';
  }
}
