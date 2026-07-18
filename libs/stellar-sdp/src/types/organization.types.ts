export interface Organization {
  id?: string;
  name?: string;
  logo_url?: string;
  timezone_utc_offset?: string;
  is_approval_required?: boolean;
  [key: string]: unknown;
}

export interface UpdateOrganizationRequest {
  organization_name?: string;
  timezone_utc_offset?: string;
  is_approval_required?: boolean;
  logo?: Buffer;
}
