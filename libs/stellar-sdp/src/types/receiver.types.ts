import { PaginationParams } from './common.types';

export interface Receiver {
  id: string;
  external_id?: string;
  phone_number?: string;
  email?: string;
  created_at?: string;
  updated_at?: string;
  wallets?: ReceiverWallet[];
  verifications?: ReceiverVerification[];
  [key: string]: unknown;
}

export interface ReceiverWallet {
  id: string;
  stellar_address?: string;
  stellar_memo?: string;
  status?: string;
  [key: string]: unknown;
}

export interface ReceiverVerification {
  type: string;
  value: string;
}

export interface CreateReceiverRequest {
  external_id: string;
  phone_number?: string;
  email?: string;
  verifications?: ReceiverVerification[];
}

export interface UpdateReceiverRequest {
  date_of_birth?: string;
  pin?: string;
  national_id?: string;
  email?: string;
  phone_number?: string;
  external_id?: string;
}

export interface UpdateReceiverWalletRequest {
  stellar_address?: string;
  stellar_memo?: string;
}

export interface UpdateReceiverWalletStatusRequest {
  status: string;
}

export interface ReceiverListParams extends PaginationParams {
  status?: string;
}

export interface VerificationType {
  type: string;
  [key: string]: unknown;
}
