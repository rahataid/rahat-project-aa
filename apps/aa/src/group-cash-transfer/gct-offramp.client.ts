import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { RpcException } from '@nestjs/microservices';
import { AppService } from '../app/app.service';

@Injectable()
export class GctOfframpClient {
  private readonly logger = new Logger(GctOfframpClient.name);

  constructor(private readonly appService: AppService, private readonly httpService: HttpService) {}

  private async fetchOfframpSettings(): Promise<{ url: string; appId: string; accessToken: string }> {
    const offrampSettings = await this.appService.getSettings({ name: 'OFFRAMP_SETTINGS' });
    const url = offrampSettings?.value?.url as string;
    const appId = offrampSettings?.value?.appid as string;
    const accessToken = offrampSettings?.value?.accesstoken as string;

    if (!url || !appId || !accessToken) {
      throw new RpcException('Offramp url/AppId/AccessToken not found in settings.');
    }

    return { url, appId, accessToken };
  }

  async getOfframpWalletAddress(): Promise<string> {
    const { url, appId } = await this.fetchOfframpSettings();
    try {
      const {
        data: { data },
      } = await this.httpService.axiosRef.get<{ success: boolean; data: any }>(`${url}/app/${appId}`, {
        headers: { APP_ID: appId },
      });
      return data.wallet;
    } catch (error: any) {
      this.logger.error(`Failed to fetch offramp wallet address: ${error.message}`);
      throw new RpcException(`Failed to fetch offramp wallet address: ${error.message}`);
    }
  }

  async validateBankAccount(params: { bankId: string; accountName: string; accountId: string }): Promise<any> {
    const { url, appId } = await this.fetchOfframpSettings();
    try {
      const { data: { data } } = await this.httpService.axiosRef.post(
        `${url}/payment-provider/json-rpc`,
        { provider: 'cips', method: 'validateAccount', params },
        { headers: { APP_ID: appId } }
      );

      this.logger.log(`Bank account validation response: ${JSON.stringify(data)}`);
      
      return data;
    } catch (error: any) {
      throw new RpcException(
        `Failed to validate bank account: ${error?.response?.data?.message || error?.message}`
      );
    }
  }

  async instantOfframp(offrampPayload: unknown): Promise<any> {
    const { url, appId } = await this.fetchOfframpSettings();
    try {
      const {
        data: { data },
      } = await this.httpService.axiosRef.post(`${url}/offramp-request/instant`, offrampPayload, {
        headers: { APP_ID: appId },
      });
      return data;
    } catch (error: any) {
      throw new RpcException(
        `Failed to initiate instant offramp: ${error?.response?.data?.message || error?.message}`
      );
    }
  }

   async instantOfframpV2(offrampPayload: unknown): Promise<any> {
    const { url, appId } = await this.fetchOfframpSettings();
    try {
      const {
        data: { data },
      } = await this.httpService.axiosRef.post(`${url}/offramp-request/instant-v2`, offrampPayload, {
        headers: { APP_ID: appId },
      });
      return data;
    } catch (error: any) {
      throw new RpcException(
        `Failed to initiate instant offramp: ${error?.response?.data?.message || error?.message}`
      );
    }
  }
}
