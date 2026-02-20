import { ApiProperty } from '@nestjs/swagger';
import { GrievanceType, GrievanceStatus } from '@prisma/client';

export class GrievanceTypeStats {
  @ApiProperty({
    description: 'Total count of technical grievances',
    example: 15,
  })
  TECHNICAL: number;

  @ApiProperty({
    description: 'Total count of non-technical grievances',
    example: 8,
  })
  NON_TECHNICAL: number;

  @ApiProperty({
    description: 'Total count of other grievances',
    example: 3,
  })
  OTHER: number;
}

export class GrievanceStatusStats {
  @ApiProperty({
    description: 'Total count of new grievances',
    example: 10,
  })
  NEW: number;

  @ApiProperty({
    description: 'Total count of grievances under review',
    example: 5,
  })
  UNDER_REVIEW: number;

  @ApiProperty({
    description: 'Total count of resolved grievances',
    example: 8,
  })
  RESOLVED: number;

  @ApiProperty({
    description: 'Total count of closed grievances',
    example: 3,
  })
  CLOSED: number;
}

export class GrievanceStatsResponse {
  @ApiProperty({
    description: 'Total number of grievances',
    example: 26,
  })
  totalGrievances: number;

  @ApiProperty({
    description: 'Grievance counts by type',
    type: GrievanceTypeStats,
  })
  grievanceType: GrievanceTypeStats;

  @ApiProperty({
    description: 'Grievance counts by status',
    type: GrievanceStatusStats,
  })
  grievanceStatus: GrievanceStatusStats;

  @ApiProperty({
    description: 'Average resolve time in milliseconds',
    example: 88200000,
  })
  averageResolveTime: number;
}
