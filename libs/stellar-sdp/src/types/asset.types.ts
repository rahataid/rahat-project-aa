export interface Asset {
  id: string;
  code: string;
  issuer: string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  [key: string]: unknown;
}

export interface CreateAssetRequest {
  code: string;
  issuer: string;
}
