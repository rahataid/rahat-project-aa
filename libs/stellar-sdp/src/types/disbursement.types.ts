import { PaginationParams } from './common.types';

export interface Disbursement {
  id: string;
  name: string;
  status?: string;
  status_history?: { user_id: string; status: string; timestamp: string }[];
  wallet_id?: string;
  asset_id?: string;
  verification_field?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CreateDisbursementRequest {
  name: string;
  wallet_id: string;
  asset_id: string;
  verification_field: string;
  registration_contact_type?: string;
  receiver_registration_message_template?: string;
  file: Buffer;
  filename?: string;
}

export interface UpdateDisbursementStatusRequest {
  status: string;
}

export interface DisbursementListParams extends PaginationParams {
  status?: string;
}

export interface DisbursementReceiverListParams {
  page?: number;
  page_limit?: number;
  sort?: string;
  direction?: 'asc' | 'desc';
}

export interface RegistrationContactType {
  type: string;
  [key: string]: unknown;
}
