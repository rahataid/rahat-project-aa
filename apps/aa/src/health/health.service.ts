import { InjectQueue } from '@nestjs/bull';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { BQUEUE } from '../constants';
import { PrismaService } from '@rumsan/prisma';
import { Queue } from 'bull';
import { CommsService } from '../comms/comms.service';
import {
  HealthStatus,
  SERVICE_LABELS,
  ServiceStatus,
  updateHealthStatus,
} from '../utils/health.check';
import { TriggerType } from '@rumsan/connect';
import { lastValueFrom } from 'rxjs';
import { ClientProxy } from '@nestjs/microservices';

// Stores the last-known set of down services + timestamp of last down-alert.
// Diffed each run to detect newly-down (alert) and restored (notice) services.
// Re-alerts every 24h while the same services remain down.
const ALERT_STATE_KEY = 'project_health_alert_state';
const RE_ALERT_INTERVAL_MS = 24 * 60 * 60 * 1000;

interface AlertState {
  down: string[];
  lastAlertAt: number | null;
}

@Injectable()
export class HealthService {
  private readonly CACHE_KEY = 'health_status';
  private readonly CACHE_TTL = 60;
  private readonly _logger = new Logger(HealthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commsService: CommsService,
    @Inject('CORE_CLIENT') private readonly coreClient: ClientProxy,

    @InjectQueue(BQUEUE.COMMUNICATION)
    private readonly rahatQueue: Queue
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

  async sendHealthAlertEmail(
    downServices: Array<{ name: string; message?: string }>,
    frontendUrl?: string
  ): Promise<void> {
    try {
      this._logger.log('Health status alert email sending..');
      const transportId = await this.commsService.getEmailTransportId();
      const recipients = (process.env.HEALTH_ALERT_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean) as any;

      if (!recipients.length) {
        this._logger.warn('HEALTH_ALERT_EMAILS not configured, skipping alert');
        return;
      }

      await this.commsService.broadcast.create({
        transport: transportId,
        addresses: recipients,
        maxAttempts: 3,
        trigger: TriggerType.IMMEDIATE,
        message: {
          content: this.buildHealthEmailHtml('down', downServices, frontendUrl),
          meta: {
            subject: `[ALERT] ${downServices.length} service(s) down – Rahat Health Check`,
          },
        },
        options: {},
      });

      this._logger.log(`Health down-alert sent to: ${recipients.join(', ')}`);
    } catch (err) {
      this._logger.error(err);
    }
  }

  async sendHealthRestoredEmail(
    restoredServices: Array<{ name: string; restored: boolean }>,
    frontendUrl?: string
  ): Promise<void> {
    try {
      const transportId = await this.commsService.getEmailTransportId();
      const recipients = (process.env.HEALTH_ALERT_EMAILS ?? '')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);

      if (!recipients.length) return;

      await this.commsService.broadcast.create({
        transport: transportId,
        addresses: recipients,
        maxAttempts: 3,
        trigger: TriggerType.IMMEDIATE,
        message: {
          content: this.buildHealthEmailHtml(
            'up',
            restoredServices.map(({ name }) => ({ name })),
            frontendUrl
          ),
          meta: {
            subject: `[NOTICE] All services restored – Rahat Health Check`,
          },
        },
        options: {},
      });

      this._logger.log(
        `Health restored-notice sent to: ${recipients.join(', ')}`
      );
    } catch (err) {
      this._logger.error(err);
    }
  }

  private async handleAlertTransitions(result: HealthStatus): Promise<void> {
    try {
      const downNow = this.getDownServices(result);
      const prev = await this.getAlertState();

      const newlyDown = downNow.filter((s) => !prev.down.includes(s));
      const restored = prev.down.filter((s) => !downNow.includes(s));
      const [frontendSetting] = await lastValueFrom(
        this.coreClient.send({ cmd: 'appJobs.frontendUrl.get' }, {})
      );
      const frontendUrl = frontendSetting?.value ?? '';
      const noTransition = newlyDown.length === 0 && restored.length === 0;

      if (newlyDown.length) {
        await this.sendHealthAlertEmail(
          newlyDown.map((name) => {
            const svc = (result.services as Record<string, ServiceStatus>)[
              name
            ];
            return {
              name: SERVICE_LABELS[name] ?? name,
              message: svc?.message,
            };
          }),
          frontendUrl
        );
        prev.lastAlertAt = Date.now();
      }

      if (restored.length) {
        this._logger.log('health status up ');
        const upServices = Object.entries(result.services)
          .filter(([, status]) => status.status === 'up')
          .map(([name]) => ({
            name: SERVICE_LABELS[name] ?? name,
            restored: restored.includes(name),
          }));
        await this.sendHealthRestoredEmail(upServices, frontendUrl);
      }

      // Re-alert only when state is stable (no transition) and the same
      // services have been continuously down for 24h since the last alert.
      if (
        noTransition &&
        downNow.length > 0 &&
        (prev.lastAlertAt === null ||
          Date.now() - prev.lastAlertAt >= RE_ALERT_INTERVAL_MS)
      ) {
        await this.sendHealthAlertEmail(
          downNow.map((name) => {
            const svc = (result.services as Record<string, ServiceStatus>)[
              name
            ];
            return {
              name: SERVICE_LABELS[name] ?? name,
              message: svc?.message,
            };
          }),
          frontendUrl
        );
        prev.lastAlertAt = Date.now();
      }

      const state: AlertState = {
        down: downNow,
        lastAlertAt: downNow.length ? prev.lastAlertAt : null,
      };
      await this.rahatQueue.client.setex(
        ALERT_STATE_KEY,
        24 * 60 * 60, // 24h safety TTL; overwritten every run while alive
        JSON.stringify(state)
      );
    } catch (err) {
      this._logger.error(`Failed to send health alert email: ${err}`);
    }
  }

  private async getAlertState(): Promise<AlertState> {
    const stored = (await this.rahatQueue.client.get(ALERT_STATE_KEY)) ?? '';
    if (!stored) return { down: [], lastAlertAt: null };
    try {
      const parsed = JSON.parse(stored);
      // Backwards-compatible with legacy array format.
      if (Array.isArray(parsed)) return { down: parsed, lastAlertAt: null };
      return parsed as AlertState;
    } catch {
      return { down: [], lastAlertAt: null };
    }
  }

  private getDownServices(result: HealthStatus): string[] {
    return Object.entries(result.services)
      .filter(([, status]) => status.status === 'down')
      .map(([name]) => name);
  }

  private async setCache(data: HealthStatus): Promise<void> {
    this._logger.log('Caching the health status');
    await this.rahatQueue.client.setex(
      this.CACHE_KEY,
      this.CACHE_TTL,
      JSON.stringify(data)
    );
  }

  private buildHealthEmailHtml(
    type: 'down' | 'up',
    services: Array<{ name: string; message?: string; restored?: boolean }>,
    frontendUrl?: string
  ): string {
    const isDown = type === 'down';
    const accent = isDown ? '#d9534f' : '#5cb85c';
    const heading = isDown ? '⚠ Service Health Alert' : '✓ Services Restored';
    const intro = isDown
      ? 'The following service(s) are currently unavailable:'
      : 'All services are now healthy:';

    const rows = services
      .map(({ name, message, restored }) => {
        const label = isDown ? 'DOWN' : restored ? 'RESTORED' : 'UP';
        const time = new Date().toLocaleTimeString();
        const color = isDown ? '#d9534f' : restored ? '#f0ad4e' : '#5cb85c';
        return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${color};font-weight:500">${label}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;color:${color};font-weight:500">${time}</td>

          ${
            isDown
              ? `<td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;font-size:.9em">${
                  message ?? 'No details'
                }</td>`
              : ''
          }
        </tr>`;
      })
      .join('');

    const extraHeader = isDown
      ? `<th style="text-align:left;padding:10px 12px;font-size:.85em">Message</th>`
      : '';

    return `<!DOCTYPE html>
  <html>
    <head><meta charset="utf-8"><style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f5f5;padding:20px}
      .wrap{max-width:700px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1)}
      .hdr{background:${accent};color:#fff;padding:20px 24px;text-align:center}
      .hdr h2{margin:0;font-size:1.2em}
      .body{padding:24px}
      table{width:100%;border-collapse:collapse}
      th{background:#f8f8f8;color:#333;text-align:left;padding:10px 12px;font-size:.85em}
      .foot{background:#f8f8f8;padding:16px 24px;text-align:center;color:#999;font-size:.85em}
    </style></head>
    <body>
      <div class="wrap">
      <div class="hdr"><h2>${heading}</h2></div>
      <div class="body">
      <p>${intro}</p>
      <table>
        <thead><tr>
          <th style="width:30%">Service</th>
          <th style="width:20%">Status</th>
          <th style="width:20%">Time</th>
          ${extraHeader}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
      <div class="foot">
      <p>Automated alert from Rahat AA Project Health Check  for   <p><a href="${frontendUrl}">Dashboard</a>· ${new Date().toLocaleString()} </p>
      </div>
      </div>
    </body>
  </html>`;
  }
}
