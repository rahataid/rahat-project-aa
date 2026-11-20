import { Controller, UseGuards } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MicroserviceAuthGuard } from '@rumsan/user';
import { JOBS } from '../constants';
import { DashboardReportsService } from './dashboard-reports.service';
import {
  ExportDashboardReportDto,
  ListDashboardReportsDto,
} from './dto/export-dashboard-report.dto';

@Controller()
@UseGuards(MicroserviceAuthGuard)
export class DashboardReportsController {
  constructor(
    private readonly dashboardReportsService: DashboardReportsService,
  ) {}

  @MessagePattern({
    cmd: JOBS.DASHBOARD_REPORTS.LIST_REPORTS,
    uuid: process.env.PROJECT_ID,
  })
  listReports(@Payload() payload: ListDashboardReportsDto) {
    return this.dashboardReportsService.listReports(payload);
  }

  @MessagePattern({
    cmd: JOBS.DASHBOARD_REPORTS.EXPORT_FILE,
    uuid: process.env.PROJECT_ID,
  })
  exportFile(@Payload() payload: ExportDashboardReportDto) {
    return this.dashboardReportsService.exportFile(payload);
  }
}
