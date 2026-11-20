import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { ReportFormat } from '../report.config';

/** Payload for listing the dashboard reports available to a project. */
export class ListDashboardReportsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  appId?: string;
}

/**
 * Payload for the dashboard report file export message pattern. The backend is
 * the source of truth: it derives the rows from the project's stats, so the
 * caller only supplies the report it wants and the file format.
 */
export class ExportDashboardReportDto {
  @ApiProperty({ description: 'Id of the dashboard report to generate' })
  @IsString()
  reportId: string;

  @ApiProperty({ enum: ['xlsx', 'pdf'], description: 'Download file format' })
  @IsIn(['xlsx', 'pdf'])
  format: ReportFormat;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  appId?: string;
}
