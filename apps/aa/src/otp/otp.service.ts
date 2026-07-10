import { Inject, Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import prabhu from './prabhu';
import type { CommsClient } from '../comms/comms.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject('COMMS_CLIENT')
    private commsClient: CommsClient
  ) {}

  async sendSms(number: string, message: string, defaultOpt?: string | null) {
    const otp = defaultOpt || (await this.getOtp());

    this.logger.log(`Generated OTP ${otp} for phone number ${number}`);

    this.logger.log(`Generated OTP ${otp} for phone number ${number}`);

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV] OTP for ${number}: ${otp}`);
      return { otp };
    }

    this.logger.log(`Sending SMS to ${number} with message: ${message}`);
    try {
      const { data } = await this.commsClient.transport.list();
      const appId =
        this.commsClient.apiClient.client.defaults.headers['app-id'];
      const url = this.commsClient.apiClient.client.defaults.baseURL;
      const transportId = data.find((item) => item.name === 'SMS')?.cuid;

      if (!transportId || !appId || !url) {
        throw new RpcException('SMS_TRANSPORT_ID, APP_ID, URL are required');
      }

      const finalMessage = `${message} ${otp}`;
      const sms = await this.loadSmsModule('prabhu');

      await sms(number, finalMessage, {
        transportId,
        appId,
        url,
      });
      this.logger.log(`OTP Sent to phone number: ${number}`);
      return { otp };
    } catch (error) {
      this.logger.error(`Error sending SMS: ${error.message}`);
      throw new RpcException('Failed to send SMS');
    }
  }

  async sendEmail(email: string, subject: string, message: string, defaultOtp?: string | null) {
    const otp = defaultOtp || (await this.getOtp());
    this.logger.log(`Generated OTP ${otp} for email ${email}`);

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV] OTP for ${email}: ${otp}`);
      return { otp };
    }

    try {
      const { data } = await this.commsClient.transport.list();
      const appId = this.commsClient.apiClient.client.defaults.headers['app-id'];
      const transportId = data.find((item) => item.name === 'EMAIL')?.cuid;

      if (!transportId || !appId) {
        throw new RpcException('EMAIL transport not configured');
      }

      await this.commsClient.broadcast.create({
        transport: transportId,
        addresses: [email],
        message: { content: `${message} ${otp}`, meta: { subject } },
        maxAttempts: 1,
        trigger: 'DIRECT' as any,
        options: {},
      });

      this.logger.log(`OTP sent to email: ${email}`);
      return { otp };
    } catch (error: any) {
      this.logger.error(`Error sending email: ${error.message}`);
      throw new RpcException('Failed to send email');
    }
  }

  async getOtp() {
    if (process.env.NODE_ENV !== 'production') {
      return '123456';
    }
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async loadSmsModule(provider) {
    const smsModules = {
      prabhu,
    };
    const serviceName: string =
      provider && provider.toLowerCase() in smsModules
        ? provider.toLowerCase()
        : 'prabhu';

    const module = smsModules[serviceName];

    return module;
  }
}
