import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { getClient } from '@rumsan/connect/src/clients';
import * as nodemailer from 'nodemailer';

const GET_COMMUNICATION_SETTINGS = 'appJobs.communication.getSettings';
const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;
const TIMEOUT_MS = 5000;

export type CommsClient = ReturnType<typeof getClient>;

@Injectable()
export class CommsService {
  private client: CommsClient | null = null;
  private logger = new Logger(CommsService.name);
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;
  private emailTransportId: string | null = null;
  private retryCount = 0;

  constructor(
    @Inject('CORE_CLIENT') private readonly coreClient: ClientProxy
  ) {}

  async init() {
    if (this.isInitializing) {
      return this.initializationPromise;
    }

    this.isInitializing = true;
    this.initializationPromise = this.attemptInitialization().then(async () => {
      this.emailTransportId = await this.getEmailClient();
    });

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
        throw new RpcException({
          message: 'Communication settings not found in response',
          code: 'COMMUNICATION_SETTINGS_NOT_FOUND',
        });
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

  get broadcast() {
    if (!this.client) {
      throw new RpcException({
        message: 'Comms client is not available. Service is still initializing.',
        code: 'COMMS_CLIENT_NOT_AVAILABLE',
      });
    }
    return this.client.broadcast;
  }

  get apiClient() {
    if (!this.client) {
      throw new RpcException({
        message: 'Comms client is not available. Service is still initializing.',
        code: 'COMMS_CLIENT_NOT_AVAILABLE',
      });
    }
    return this.client.apiClient;
  }

  async listTransports(): Promise<any> {
    const commsClient = await this.getClient();
    if (!commsClient) {
      throw new RpcException({
        message: 'Comms client is not available. Service is still initializing.',
        code: 'COMMS_CLIENT_NOT_AVAILABLE',
      });
    }
    const { data } = await commsClient.transport.list();
    
    return data;
  }

  async getEmailTransportId(): Promise<string> {
    const transportData = await this.listTransports();
    const emailTransport = transportData.find(
      (item: any) => item.name === 'EMAIL' && item.type === 'SMTP'
    );
    if (!emailTransport) {
      throw new RpcException({
        message: 'No EMAIL/SMTP transport found',
        code: 'NO_EMAIL_SMTP_TRANSPORT_FOUND',
      });
    }
    return emailTransport.cuid;
  }

  async getEmailClient(): Promise<string> {
    return this.getEmailTransportId();
  }
}
