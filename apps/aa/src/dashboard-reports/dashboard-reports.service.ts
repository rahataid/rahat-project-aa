import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { SettingsService } from '@rumsan/settings';
import { StatsService } from '../stats';
import {
  ExportDashboardReportDto,
  ListDashboardReportsDto,
} from './dto/export-dashboard-report.dto';
import {
  DASHBOARD_REPORT_DEFINITIONS,
  DashboardReportSummary,
  ReportDefinition,
} from './report.config';
import {
  buildExcel,
  buildPdf,
  buildReportRows,
  DashboardStats,
  reportHasData,
  ReportFile,
  toReportFile,
} from './report-file.builder';

type ReportContext = {
  definitions: ReportDefinition[];
  stats: DashboardStats;
  projectName: string;
};

@Injectable()
export class DashboardReportsService {
  private readonly logger = new Logger(DashboardReportsService.name);

  constructor(
    private readonly settingsService: SettingsService,
    private readonly statsService: StatsService,
  ) {}

  /**
   * Backend source of truth for the download dialog: derive the available
   * reports from the enabled dashboard tabs, project info and live stats.
   */
  async listReports(
    payload: ListDashboardReportsDto,
  ): Promise<{ reports: DashboardReportSummary[] }> {
    const context = await this.loadReportContext(payload?.appId);
    return {
      reports: context.definitions.map((definition) => ({
        id: definition.id,
        title: definition.title,
        formats: definition.formats,
      })),
    };
  }

  async exportFile(payload: ExportDashboardReportDto): Promise<ReportFile> {
    const { reportId, format, appId } = payload;

    if (format !== 'xlsx' && format !== 'pdf') {
      throw new RpcException({
        message: `Unsupported dashboard report format '${format}'`,
        code: 'DASHBOARD_REPORT_FORMAT_NOT_SUPPORTED',
        params: { format },
      });
    }

    const context = await this.loadReportContext(appId);
    const definition = context.definitions.find(
      (candidate) => candidate.id === reportId,
    );

    if (!definition) {
      throw new RpcException({
        message: `Report '${reportId}' is not available for this project`,
        code: 'DASHBOARD_REPORT_NOT_AVAILABLE',
        params: { reportId },
      });
    }

    if (!definition.formats.includes(format)) {
      throw new RpcException({
        message: `Report '${reportId}' cannot be exported as '${format}'`,
        code: 'DASHBOARD_REPORT_FORMAT_NOT_SUPPORTED',
        params: { reportId, format },
      });
    }

    const rows = buildReportRows(definition, context.stats, { projectId: appId });
    if (!rows.length) {
      throw new RpcException({
        message: 'No data is currently shown for this report',
        code: 'DASHBOARD_REPORT_NO_DATA',
        params: { reportId },
      });
    }

    this.logger.log(
      `Generating ${format.toUpperCase()} dashboard report '${reportId}' with ${rows.length} rows (${context.projectName})`,
    );

    const buffer =
      format === 'xlsx'
        ? buildExcel(definition.title, context.projectName, rows)
        : await buildPdf(definition.title, context.projectName, rows);

    return toReportFile(buffer, definition.title, format);
  }

  /** Load everything needed to decide which reports are available. */
  private async loadReportContext(appId?: string): Promise<ReportContext> {
    const [enabledTabs, projectInfo, stats] = await Promise.all([
      this.getEnabledTabs(),
      this.getProjectInfo(),
      this.loadStats(appId),
    ]);

    const definitions = stats
      ? DASHBOARD_REPORT_DEFINITIONS.filter(
          (definition) =>
            this.isReportAvailable(definition, enabledTabs, projectInfo) &&
            reportHasData(definition, stats, { projectId: appId }),
        )
      : [];

    return {
      definitions,
      stats: stats ?? { benefStats: [], triggeersStats: [], tokenStats: {} },
      projectName: this.projectName(projectInfo),
    };
  }

  private async loadStats(appId?: string): Promise<DashboardStats | undefined> {
    try {
      return (await this.statsService.findAll({
        appId: (appId || process.env.PROJECT_ID) as Parameters<
          StatsService['findAll']
        >[0]['appId'],
      })) as DashboardStats;
    } catch (error) {
      this.logger.warn(
        `Could not load dashboard statistics: ${(error as Error)?.message}`,
      );
      return undefined;
    }
  }

  private projectName(projectInfo: Record<string, any>): string {
    return (
      String(
        projectInfo?.PROJECT_NAME ??
          projectInfo?.project_name ??
          projectInfo?.NAME ??
          projectInfo?.name ??
          '',
      ) || 'AA Project'
    );
  }

  private async getEnabledTabs(): Promise<string[]> {
    try {
      const setting = await this.settingsService.getPublic(
        'DASHBOARD_TAB_CONFIG',
      );
      const tabs = (setting?.value as any)?.tabs;
      if (!Array.isArray(tabs)) return [];
      return tabs
        .map((tab: any) => tab?.value)
        .filter((value: unknown): value is string => typeof value === 'string');
    } catch (error) {
      this.logger.warn(
        `Could not load DASHBOARD_TAB_CONFIG: ${(error as Error)?.message}`,
      );
      return [];
    }
  }

  private async getProjectInfo(): Promise<Record<string, any>> {
    try {
      const setting = await this.settingsService.getPublic('PROJECTINFO');
      return (setting?.value ?? {}) as Record<string, any>;
    } catch (error) {
      this.logger.warn(
        `Could not load PROJECTINFO: ${(error as Error)?.message}`,
      );
      return {};
    }
  }

  private isReportAvailable(
    definition: ReportDefinition,
    enabledTabs: string[],
    projectInfo: Record<string, any>,
  ): boolean {
    if (definition.requiresFlood2026) {
      const type = String(
        projectInfo.PROJECT_TYPE ?? projectInfo.project_type ?? '',
      ).toUpperCase();
      const year = String(
        projectInfo.ACTIVE_YEAR ?? projectInfo.active_year ?? '',
      ).trim();
      if (type !== 'FLOOD' || year !== '2026') return false;
    }

    if (!definition.configKey) return true;
    return enabledTabs.includes(definition.configKey);
  }
}
