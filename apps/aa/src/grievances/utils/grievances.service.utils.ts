import { Grievance } from '@prisma/client';
import { CreatedByUser } from '../dto/create-grievance.dto';

export function formatCoreCreateGrievancePayload(data: Grievance) {
  const { id, createdByUser, ...rest } = data;
  const typedCreatedByUser = createdByUser as unknown as CreatedByUser | null;
  return {
    ...rest,
    projectId: process.env.PROJECT_ID,
    userId: Number(typedCreatedByUser?.id),
  };
}

export function formatCoreUpdateGrievancePayload(data: Grievance) {
  const { id, createdByUser, ...rest } = data;
  const typedCreatedByUser = createdByUser as unknown as CreatedByUser | null;
  return {
    ...rest,
    projectId: process.env.PROJECT_ID,
    userId: typedCreatedByUser?.id,
  };
}
