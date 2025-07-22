export interface IDisbursementService {
  createDisbursementProcess(
    disbursementName: string,
    fileBuffer: Buffer,
    fileName: string,
    amount: string
  ): Promise<IDisbursementResult>;

  getDistributionAddress(tenantName: string): Promise<string>;

  getDisbursement(disbursementId: string): Promise<IDisbursement | null>;
}

export interface IDisbursement {
  id: string;
  name: string;
  status: DisbursementStatus;
  status_history: IDisbursementStatusHistory[];
  amount_disbursed: string;
  createdAt: string;
  updatedAt: string;
}

export interface IDisbursementStatusHistory {
  user_id: string;
  status: string;
  timestamp: string;
}

export interface IDisbursementResult {
  disbursementID: string;
  assetIssuer: string;
}

export type DisbursementStatus =
  | 'DRAFT'
  | 'STARTED'
  | 'PAUSED'
  | 'READY'
  | 'FAILED'
  | 'ERROR'
  | 'COMPLETED';

export interface IDisbursementConfig {
  tenantName: string;
  email: string;
  password: string;
  baseUrl: string;
  assetCode: string;
  assetIssuer: string;
  assetSecret: string;
  horizonServer: string;
  network: string;
}
