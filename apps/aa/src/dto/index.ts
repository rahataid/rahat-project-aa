import { DataSource } from "@prisma/client";

export interface TriggerDocs {
  mediaURL: string;
  fileName: string;
}

export interface AddTriggerStatement {
  uuid?: string;
  location?: string;
  dataSource: DataSource;
  repeatEvery?: number | string;
  activities?: Array<{
    uuid: string;
  }>;
  triggerStatement?: Record<string, any>;
  hazardTypeId?: string;
  phaseId: string;
  title?: string;
  triggerDocuments?: Array<TriggerDocs>
  notes?: string;
}

export interface UpdateTriggerStatement {
  uuid?: string;
  repeatKey?: string;
  location?: string;
  dataSource: DataSource;
  repeatEvery?: number | string;
  activities?: Array<{
    uuid: string;
  }>;
  triggerStatement?: Record<string, any>;
  triggerDocuments?: Array<TriggerDocs>
  hazardTypeId?: string;
  phaseId: string;
  title?: string;
  notes?: string;
}

export interface RemoveTriggerStatement {
  repeatKey: string;
}
