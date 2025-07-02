import { Grievance } from '@prisma/client';

export function formatCoreCreateGrievancePayload(data: Grievance) {
  const { id, reporterUserId, ...rest } = data;
  return {
    ...rest,
    projectId: process.env.PROJECT_ID,
    userId: reporterUserId,
  };
}

export function formatCoreUpdateGrievancePayload(data: Grievance) {
  const { id, reporterUserId, ...rest } = data;
  return {
    ...rest,
    projectId: process.env.PROJECT_ID,
    userId: reporterUserId,
  };
}
