import {
  Controller,
  Logger,
  OnApplicationBootstrap,
  OnModuleInit,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HealthService } from '../health/health.service';

@Controller('cron')
export class CronController implements OnApplicationBootstrap, OnModuleInit {
  private readonly logger = new Logger(CronController.name);

  constructor(private readonly healthService: HealthService) {
    console.log('CronController instantiated');
  }

  async onModuleInit() {
    console.log('onModuleInit called - CronModule initialized');
  }

  async onApplicationBootstrap() {
    this.logger.log(
      'onApplicationBootstrap called - running initial health check...'
    );
    try {
      const result = await this.healthService.checkHealthStatus();
      this.logger.log(`Initial health check completed: ${result.status}`);
    } catch (error) {
      this.logger.error('Initial health check failed', error);
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  handleCron() {
    this.healthService.checkHealthStatus().catch((error: any) => {
      this.logger.error('Scheduled health check failed', error);
    });
  }
}
