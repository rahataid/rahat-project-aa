import { DataSource } from "@prisma/client";

export interface AddDataSource {
  uuid?: string;
  location: string;
  dataSource: DataSource;
  repeatEvery: number;
  triggerActivity: string[];
  triggerStatement: Record<string,any>;
  hazardTypeId: string;
}

export interface RemoveDataSource {
  repeatKey: string;
}

// await this.prisma.dataSources.create({
//   data: {
//     repeatKey: repeatableKey,
//     uuid: uuid,
//     isActive: true,
//     location: payload.location,
//     dataSource: payload.dataSource,
//     repeatEvery: payload.repeatEvery,
//     triggerStatement: payload.triggerStatement,
//     hazardTypeId: payload.hazardTypeId
//   }
// })