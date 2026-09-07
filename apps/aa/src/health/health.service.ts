import { InjectQueue } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import { BQUEUE } from '../constants';
import { PrismaService } from '@rumsan/prisma';
import { Queue } from 'bull';
import { CommsService } from '../comms/comms.service';
import {
  HealthStatus,
  ServiceStatus,
  updateHealthStatus,
} from '../utils/health.check';

// Stores the last-known set of down services (JSON array of names).
// Diffed each run to detect newly-down (alert) and restored (notice) services.
const ALERT_STATE_KEY = 'health_alert_state';

const SERVICE_LABELS: Record<string, string> = {
  database: 'Database',
  redis: 'Redis',
  rpcUrl: 'RPC URL',
  cloudflare: 'Cloudflare',
  offRamp: 'Off-Ramp',
};

@Injectable()
export class HealthService {
  private readonly CACHE_KEY = 'health_status';
  private readonly CACHE_TTL = 60;

  constructor(
    private readonly prisma: PrismaService,
    private readonly _logger: Logger,
    private readonly commsService: CommsService,
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
    const result = await updateHealthStatus(this.prisma, this.rahatQueue);
    await this.setCache(result);
    await this.handleAlertTransitions(result);
    return result;
  }

  /**
   * Compares current down-services against last-known set (redis) and emails
   * on transition: newly-down -> alert, restored -> notice. Silent otherwise.
   */
  private async handleAlertTransitions(result: HealthStatus): Promise<void> {
    try {
      const downNow = this.getDownServices(result);
      const stored = (await this.rahatQueue.client.get(ALERT_STATE_KEY)) ?? '[]';
      const downBefore: string[] = JSON.parse(stored) ?? [];

      const newlyDown = downNow.filter((s) => !downBefore.includes(s));
      const restored = downBefore.filter((s) => !downNow.includes(s));

      // No emails on first run/baseline — just record current state.
      if (downBefore.length || newlyDown.length) {
        if (newlyDown.length) {
          await this.commsService.sendHealthAlertEmail(
            newlyDown.map((name) => {
              const svc = (result.services as Record<string, ServiceStatus>)[name];
              return {
                name: SERVICE_LABELS[name] ?? name,
                message: svc?.message,
              };
            })
          );
        }
        if (restored.length) {
          await this.commsService.sendHealthRestoredEmail(
            restored.map((name) => SERVICE_LABELS[name] ?? name)
          );
        }
      }

      await this.rahatQueue.client.setex(
        ALERT_STATE_KEY,
        24 * 60 * 60, // 24h safety TTL; overwritten every run while alive
        JSON.stringify(downNow)
      );
    } catch (err) {
      this._logger.error(`Failed to send health alert email: ${err}`);
    }
  }

  private getDownServices(result: HealthStatus): string[] {
    return Object.entries(result.services)
      .filter(([, status]) => status.status === 'down')
      .map(([name]) => name);
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
}
