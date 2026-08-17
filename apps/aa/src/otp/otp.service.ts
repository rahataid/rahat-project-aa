import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import { TriggerType } from '@rumsan/connect/src/types/session.type';
import { PrismaService } from '@rumsan/prisma';
import { SettingsService } from '@rumsan/settings';
import prabhu from './prabhu';
import { CommsService } from '../comms/comms.service';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settingsService: SettingsService,
    @Inject('CORE_CLIENT')
    private readonly coreClient: ClientProxy,
    private readonly commsClient: CommsService,

  ) {}

  async sendSms(number: string, message: string, defaultOpt?: string | null) {
    const otp = defaultOpt || (await this.getOtp());

    this.logger.log(`Generated OTP ${otp} for phone number ${number}`);

    if (process.env.NODE_ENV !== 'production') {
      this.logger.log(`[DEV] OTP for ${number}: ${otp}`);
      return { otp };
    }

    this.logger.log(`Sending SMS to ${number} with message: ${message}`);
    try {
      const data = await this.commsClient.listTransports();
      const appId =
        this.commsClient.apiClient.client.defaults.headers['app-id'];
      const url = this.commsClient.apiClient.client.defaults.baseURL;
      const transportId = data.find((item: any) => item.name === 'SMS')?.cuid;

      if (!transportId || !appId || !url) {
        throw new RpcException({
          message: 'SMS_TRANSPORT_ID, APP_ID, URL are required',
          code: 'SMS_TRANSPORT_CONFIG_MISSING',
        });
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
      this.logger.error(`Error sending SMS: ${(error as any).message}`);
      throw new RpcException({
        message: 'Failed to send SMS',
        code: 'FAILED_TO_SEND_SMS',
      });
    }
  }

  async sendEmail(email: string, subject: string, message: string, defaultOtp?: string | null) {
    const otp = defaultOtp || (await this.getOtp());
    const [frontendSetting] = await lastValueFrom(
      this.coreClient.send({ cmd: 'appJobs.frontendUrl.get' }, {})
    );
    const frontendUrl = frontendSetting?.value ?? '';
    this.logger.log(`Generated OTP ${otp} for email ${email}`);

    try {
      const transportId = await this.commsClient.getEmailTransportId();
      const htmlContent = this.buildOtpEmailHtml(otp, frontendUrl);

      await this.commsClient.broadcast.create({
        transport: transportId,
        addresses: [email],
        maxAttempts: 3,
        trigger: TriggerType.IMMEDIATE,
        message: {
          content: htmlContent,
          meta: {
            subject,
          },
        },
        options: {},
      });

      this.logger.log(`OTP sent to email: ${email}`);
      return { otp };
    } catch (error: any) {
      this.logger.error(`Error sending email: ${error.message}`);
      throw new RpcException({
        message: 'Failed to send email',
        code: 'FAILED_TO_SEND_EMAIL',
      });
    }
  }

  private buildOtpEmailHtml(otp: string, frontendUrl?: string): string {
    return `
      <div style="max-width:800px;max-height: 600px;overflow:auto;line-height:2;background: #333333;">
        <div style="margin:50px auto;width:70%;padding:40px 40px; border: 1px solid #fff; border-radius: 12px;">
          <div style="text-align: center;">
            <img src='https://assets.rumsan.net/rumsan-group/rahat-logo-white.png' width="250" title="stage4all" alt="stage4all">
          </div>
          <div style="color:#fff; text-align: center;">
            <h4 style="font-size:1.3em;">Your Rahat Pin is</h4>
            <h2
              style="background: #373737;margin: 0 auto;width: 100%;padding: 0 10px;color: #fff;border-radius: 4px; letter-spacing: 10px">
              ${otp}</h2>
          </div>
          <div style="color: #fff; text-align: left;">
            <p>This is a one-time-code that expires in 5 minutes.</p>
            <p style="font-size:0.9em;">Please DO NOT share your code with anyone. Rahat team will never ask for it.</p>
          </div>
          <hr style=" border-top: 1px solid rgb(73, 72, 72)" />
          <div style="color:#fff!important">
            <p>If you didn't attempt to sign up but received this email, please ignore.
            </p>
            <p>
              Regards,<br />
              Team Rahat
            </p>
            ${frontendUrl ? `<p><a href="${frontendUrl}" style="color:#fff;">${frontendUrl}</a></p>` : ''}
          </div>
        </div>
      </div>
    `;
  }

    async getOtp() {
    if (process.env.NODE_ENV !== 'production') {
      return '1234';
    }
    return Math.floor(1000+ Math.random() * 9000).toString();
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
