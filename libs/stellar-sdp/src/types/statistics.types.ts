export interface Statistics {
  payment_counters?: Record<string, number>;
  receiver_wallets_counters?: Record<string, number>;
  total_disbursed?: string;
  total_payments?: number;
  total_receivers?: number;
  [key: string]: unknown;
}
