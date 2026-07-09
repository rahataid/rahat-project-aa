export interface Tenant {
  id: string;
  name: string;
  distribution_account_type?: string;
  status?: string;
  base_url?: string;
  sdp_ui_base_url?: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CreateTenantRequest {
  name: string;
  distribution_account_type: string;
  owner_email: string;
  owner_first_name: string;
  owner_last_name: string;
  organization_name: string;
  base_url?: string;
  sdp_ui_base_url?: string;
}

export interface UpdateTenantRequest {
  base_url?: string;
  sdp_ui_base_url?: string;
  status?: string;
}

export interface SetDefaultTenantRequest {
  id: string;
}
