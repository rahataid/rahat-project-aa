import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service';
import { MessagePattern } from '@nestjs/microservices';
import { JOBS } from '../constants';

@Controller('/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @MessagePattern({
    cmd: JOBS.HEALTH.GET,
    uuid: process.env.PROJECT_ID,
  })
  checkHealthStatus() {
    return this.healthService.getHealthStatus();
  }
}
