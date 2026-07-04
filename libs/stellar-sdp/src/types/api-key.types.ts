export interface ApiKey {
  id: string;
  name: string;
  permissions?: string[];
  expiry_date?: string;
  allowed_ips?: string[];
  created_at?: string;
  [key: string]: unknown;
}

export interface CreateApiKeyRequest {
  name: string;
  permissions?: string[];
  expiry_date?: string;
  allowed_ips?: string[];
}

export interface UpdateApiKeyRequest {
  permissions?: string[];
  allowed_ips?: string[];
}
