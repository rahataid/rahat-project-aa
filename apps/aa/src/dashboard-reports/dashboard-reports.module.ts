import { Module } from '@nestjs/common';
import { SettingsModule } from '@rumsan/settings';
import { MicroserviceAuthModule } from '@rumsan/user';
import { StatsModule } from '../stats';
import { DashboardReportsController } from './dashboard-reports.controller';
import { DashboardReportsService } from './dashboard-reports.service';

@Module({
  imports: [SettingsModule, StatsModule, MicroserviceAuthModule],
  controllers: [DashboardReportsController],
  providers: [DashboardReportsService],
  exports: [DashboardReportsService],
})
export class DashboardReportsModule {}
