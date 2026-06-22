export interface Balance {
  account?: string;
  balances?: AssetBalance[];
  [key: string]: unknown;
}

export interface AssetBalance {
  asset_code?: string;
  asset_issuer?: string;
  balance?: string;
  [key: string]: unknown;
}
