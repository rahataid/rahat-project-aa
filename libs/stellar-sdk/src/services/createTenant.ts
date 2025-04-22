import { TENANATS } from '../constants/routes';
import { ait } from '../lib/axios/axiosInstanceTenant';
import { ICreateTenantService } from '../types';

export class TenantServices implements ICreateTenantService {
  private tenantName: string;

  constructor(tenantName: string) {
    this.tenantName = tenantName;
  }

  public async createTenant() {
    const {
      OWNER_EMAIL,
      owner_first_name,
      owner_last_name,
      distribution_account_type,
    } = TENANATS;

    const { base_url, sdp_ui_base_url } = TENANATS.URLS(this.tenantName);

    return await ait.post(TENANATS.CREATE, {
      name: this.tenantName,
      organization_name: this.tenantName,
      base_url,
      sdp_ui_base_url,
      owner_email: OWNER_EMAIL(this.tenantName),
      owner_first_name,
      owner_last_name,
      distribution_account_type,
    });
  }
}
