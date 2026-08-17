import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { BQUEUE } from '../constants';
import { PrismaService } from '@rumsan/prisma';
import axios from 'axios';
import { Queue } from 'bull';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

interface HealthStatus {
  status: 'up' | 'degraded';
  services: {
    database: { status: 'up' | 'down'; message?: string };
    redis: { status: 'up' | 'down'; message?: string };
    rpcUrl: { status: 'up' | 'down'; message?: string };
    cloudflare: { status: 'up' | 'down' | 'degraded'; message?: string };
    offRampService: { status: 'up' | 'down' | 'degraded'; message?: string };
  };
}

@Injectable()
export class HealthService {
  private readonly CACHE_KEY = 'health_status';
  private readonly CACHE_TTL = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly _logger: Logger,
    @InjectQueue(BQUEUE.COMMUNICATION) private readonly rahatQueue: Queue
  ) {}

  async getHealthStatus(): Promise<HealthStatus> {
    this._logger.log('Get the health status');
    let result;
    const cached = await this.getHealthStatusFromCache();
    if (cached) {
      return (result = cached);
    }
    result = await this.checkHealthStatus();
    return result;
  }

  async checkHealthStatus(): Promise<HealthStatus> {
    this._logger.log('Check the health status of all  used services');
    const [database, redis, rpcUrl, cloudflare, offRampService] =
      await Promise.all([
        this.checkDatabase(),
        this.checkRedis(),
        this.checkRPCUrl(),
        this.checkCloudflare(),
        this.checkOffRampService(),
      ]);

    const allUp = database.status === 'up' && redis.status === 'up';
    const result: HealthStatus = {
      status: allUp ? 'up' : 'degraded',
      services: {
        database,
        redis,
        rpcUrl,
        cloudflare,
        offRampService,
      },
    };
    await this.setCache(result);
    return result;
  }

  async getHealthStatusFromCache(): Promise<HealthStatus | null> {
    try {
      this._logger.log('Get the service health status from cache');
      const cached = await this.rahatQueue.client.get(this.CACHE_KEY);
      if (!cached) {
        return null;
      }

      return JSON.parse(cached) as HealthStatus;
    } catch (err) {
      this._logger.error(err);
      return null;
    }
  }

  private async setCache(data: HealthStatus): Promise<void> {
    this._logger.log('Caching the health status');
    await this.rahatQueue.client.setex(
      this.CACHE_KEY,
      this.CACHE_TTL,
      JSON.stringify(data)
    );
  }

  private async checkDatabase(): Promise<{
    status: 'up' | 'down';
    message?: string;
  }> {
    this._logger.log('Checking the database status');
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', message: (error as Error).message };
    }
  }

  private async checkRedis(): Promise<{
    status: 'up' | 'down';
    message?: string;
  }> {
    this._logger.log('Checking the redis status');
    try {
      const pong = await this.rahatQueue.client.ping();
      if (pong !== 'PONG') throw new Error(`Unexpected ping response: ${pong}`);
      return { status: 'up' };
    } catch (error) {
      return { status: 'down', message: (error as Error).message };
    }
  }

  private async checkRPCUrl(): Promise<{
    status: 'up' | 'down';
    message?: string;
  }> {
    this._logger.log('Checking the rpcurl status');
    try {
      const settings = await this.prisma.setting.findUnique({
        where: {
          name: 'CHAIN_SETTINGS',
        },
      });
      const settingsValue = settings?.value as any;

      if (!settingsValue) {
        return { status: 'down', message: 'Chain settings not found' };
      }

      let rpcUrl: string | undefined;
      let chainType = '';

      // Determine which RPC URL to check (EVM or Stellar)
      if (settingsValue.evm?.rpcUrl) {
        rpcUrl = settingsValue.evm.rpcUrl;
        chainType = 'EVM';
      } else if (settingsValue.stellar?.rpcUrl) {
        rpcUrl = settingsValue.stellar.rpcUrl;
        chainType = 'Stellar';
      } else if (settingsValue.rpcUrl) {
        rpcUrl = settingsValue.rpcUrl;
        chainType = 'legacy';
      }

      if (!rpcUrl) {
        return { status: 'down', message: 'No RPC URL configured' };
      }

      this._logger.log(`Checking ${chainType} RPC URL: ${rpcUrl}`);
      if ((chainType = 'EVM')) {
        const res = await axios.post(
          rpcUrl,
          {
            jsonrpc: '2.0',
            method: 'eth_blockNumber',
            params: [],
            id: 1,
          },
          {
            headers: { 'Content-Type': 'application/json' },
            timeout: 5000,
          }
        );
      }
      if (chainType === 'Stellar') {
        const getRes = await axios.get(`${rpcUrl}/ledgers?limit=1`, {
          timeout: 5000,
        });
        if (!getRes.data || !Array.isArray(getRes.data._embedded?.records)) {
          throw new Error('Stellar RPC returned invalid response');
        }
      }

      return { status: 'up' };
    } catch (error) {
      return { status: 'down', message: (error as Error).message };
    }
  }

  private async checkCloudflare(): Promise<{
    status: 'up' | 'down';
    message?: string;
  }> {
    let settingsValue;
    this._logger.log('Checking the cloudlflare status');
    try {
      const settings = await this.prisma.setting.findUnique({
        where: {
          name: 'CLOUDFLARE_R2',
        },
      });
      settingsValue = settings?.value as any;
      const s3 = new S3Client({
        region: 'auto',
        endpoint: `https://${settingsValue.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: settingsValue.R2_ACCESS_KEY_ID,
          secretAccessKey: settingsValue.R2_SECRET_ACCESS_KEY,
        },
      });

      await s3.send(
        new HeadBucketCommand({ Bucket: settingsValue?.R2_BUCKET })
      );
      return { status: 'up' };
    } catch (error) {
      let errorMessage = 'Unknown R2 error';

      if (error.$metadata?.httpStatusCode === 403) {
        errorMessage =
          'Access Denied: Invalid credentials or scope permissions';
      } else if (error.$metadata?.httpStatusCode === 404) {
        errorMessage = `Bucket '${settingsValue?.R2_BUCKET}' does not exist`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      return { status: 'down', message: (error as Error).message };
    }
  }

  private async checkOffRampService(): Promise<{
    status: 'up' | 'down';
    message?: string;
  }> {
    let settingsValue;
    this._logger.log('Checking the offramp service status');
    try {
      const settings = await this.prisma.setting.findUnique({
        where: {
          name: 'OFFRAMP_SETTINGS',
        },
      });
      settingsValue = settings?.value as any;
      const res = await axios.get(
        `${settingsValue?.URL}/app/${settingsValue.appId}`,
        {
          headers: {
            APP_ID: `${settingsValue.appId}`,
          },
        }
      );
      // if (res.status == 200) return { status: 'up',message:res?.statusText };
      return { status: 'up', message: res?.statusText };
    } catch (err) {
      return { status: 'down', message: err };
    }
  }
}
