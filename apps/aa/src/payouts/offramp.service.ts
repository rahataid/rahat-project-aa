import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { RpcException } from '@nestjs/microservices';
import { AppService } from '../app/app.service';
import { IPaymentProvider } from '../payouts/dto/types';
import { CipsApiResponse, CipsResponseData } from './dto/types';
import { FSPOfframpDetails, FSPPayoutDetails } from '../processors/types';
import { InjectQueue } from '@nestjs/bull';
import { BQUEUE, JOBS } from '../constants';
import { Queue } from 'bull';

//TODO replace API calls with SDK
@Injectable()
export class OfframpService {
  private readonly logger = new Logger(OfframpService.name);
  private readonly offrampQueueOpts = {
    delay: 1000,
    attempts: 1,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  };

  constructor(
    @InjectQueue(BQUEUE.OFFRAMP)
    private readonly offrampQueue: Queue,
    private appService: AppService,
    private httpService: HttpService
  ) {}

  async fetchOfframpSettings(): Promise<{
    url: string;
    appId: string;
    accessToken: string;
  }> {
    const offrampSettings = await this.appService.getSettings({
      name: 'OFFRAMP_SETTINGS',
    });
    if (!offrampSettings) {
      throw new RpcException(`Offramp settings not found.`);
    }
    const url = offrampSettings?.value?.url as string;
    const appId = offrampSettings?.value?.appid as string;
    const accessToken = offrampSettings?.value?.accesstoken as string;
    if (!url || !appId || !accessToken) {
      throw new RpcException(
        `Offramp url/Appid/AccessToken not found in settings.`
      );
    }

    return {
      url,
      appId,
      accessToken,
    };
  }

  async getPaymentProvider(): Promise<IPaymentProvider[]> {
    const offrampSettings = await this.fetchOfframpSettings();

    try {
      const {
        data: { data },
      } = await this.httpService.axiosRef.get<{
        success: boolean;
        data: IPaymentProvider[];
      }>(`${offrampSettings.url}/payment-provider`);

      return data;
    } catch (error) {
      throw new RpcException(
        `Failed to fetch payment provider: ${error.message}`
      );
    }
  }

  async getOfframpWalletAddress(): Promise<string> {
    const offrampSettings = await this.fetchOfframpSettings();
    const url = offrampSettings.url;
    const appId = offrampSettings.appId;
    this.logger.log(`Fetching offramp wallet address from ${url}/app/${appId}`);
    try {
      const {
        data: { data },
      } = await this.httpService.axiosRef.get<{
        success: boolean;
        data;
      }>(`${url}/app/${appId}`);
      console.log(data);

      return data.wallet;
    } catch (error) {
      console.log(error);
      throw new RpcException(
        `Failed to fetch offramp wallet address: ${error.message}`
      );
    }
  }

  async instantOfframp(offrampPayload): Promise<CipsResponseData> {
    const offrampSettings = await this.fetchOfframpSettings();
    const url = offrampSettings.url;
    const appId = offrampSettings.appId;
    this.logger.log(
      `Initiating instant offramp to ${url}/offramp-request/instant`
    );
    try {
      const {
        data: { data },
      } = await this.httpService.axiosRef.post<CipsApiResponse>(
        `${url}/offramp-request/instant`,
        offrampPayload,
        {
          headers: {
            'app-id': appId,
          },
        }
      );

      return data;
    } catch (error) {
      throw new RpcException(
        `Failed to initiate instant offramp: ${
          error?.response?.data?.message || error?.message
        }`
      );
    }
  }

  async addBulkToOfframpQueue(payload: (FSPOfframpDetails | FSPPayoutDetails)[]) {
    const result = await this.offrampQueue.addBulk(
      payload.map((payload) => ({
        name: JOBS.OFFRAMP.INSTANT_OFFRAMP,
        data: payload,
        opts: { ...this.offrampQueueOpts },
      }))
    );

    this.logger.log(`Added ${result.length} jobs to offramp queue`);

    return result;
  }

  async addToOfframpQueue(payload: FSPOfframpDetails | FSPPayoutDetails) {
    return await this.addBulkToOfframpQueue([payload]);
  }
}
