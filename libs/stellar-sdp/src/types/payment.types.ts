import { PaginationParams } from './common.types';

export interface Payment {
  id: string;
  amount?: string;
  status?: string;
  stellar_transaction_id?: string;
  receiver_id?: string;
  disbursement_id?: string;
  external_payment_id?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CreateDirectPaymentRequest {
  amount: string;
  asset: {
    code: string;
    issuer: string;
  };
  receiver: {
    id: string;
  };
  wallet: {
    id: string;
  };
  external_payment_id?: string;
}

export interface RetryPaymentsRequest {
  payment_ids: string[];
}

export interface UpdatePaymentStatusRequest {
  status: string;
}

export interface PaymentListParams extends PaginationParams {
  type?: string;
  status?: string;
  receiver_id?: string;
}
