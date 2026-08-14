import {
  Controller,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HealthService } from '../health/health.service';

@Controller('cron')
export class CronController implements OnApplicationBootstrap, OnModuleInit {
  private readonly logger = new (require('@nestjs/common').Logger)(CronController.name);

  constructor(private readonly healthService: HealthService) {
    console.log('CronController instantiated');
  }

  async onModuleInit() {
    console.log('onModuleInit called - CronModule initialized');
  }

  async onApplicationBootstrap() {
    console.log('onApplicationBootstrap called - running initial health check...');
    try {
      const result = await this.healthService.checkHealthStatus();
      console.log(
        `Initial health check completed: ${result.status}`,
        JSON.stringify(result)
      );
    } catch (error) {
      console.error('Initial health check failed', error);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  handleCron() {
    this.healthService.checkHealthStatus().catch((error: any) => {
      this.logger.error('Scheduled health check failed', error);
    });
  }
}
