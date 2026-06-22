import { AxiosInstance } from 'axios';
import { createUserInstance } from './http/create-user-instance';
import { createAdminInstance } from './http/create-admin-instance';
import { SdpClientConfig } from './types';
import { AuthService } from './services/auth.service';
import { TenantsService } from './services/tenants.service';
import { OrganizationService } from './services/organization.service';
import { ApiKeysService } from './services/api-keys.service';
import { AssetsService } from './services/assets.service';
import { ReceiversService } from './services/receivers.service';
import { DisbursementsService } from './services/disbursements.service';
import { PaymentsService } from './services/payments.service';
import { StatisticsService } from './services/statistics.service';
import { BalancesService } from './services/balances.service';

export class SdpClient {
  private token: string | null = null;
  private readonly userHttp: AxiosInstance;
  private readonly adminHttp: AxiosInstance | null = null;

  public readonly auth: AuthService;
  public readonly tenants: TenantsService;
  public readonly organization: OrganizationService;
  public readonly apiKeys: ApiKeysService;
  public readonly assets: AssetsService;
  public readonly receivers: ReceiversService;
  public readonly disbursements: DisbursementsService;
  public readonly payments: PaymentsService;
  public readonly statistics: StatisticsService;
  public readonly balances: BalancesService;

  constructor(private readonly config: SdpClientConfig) {
    if (config.apiKey) {
      this.token = config.apiKey;
    } else if (config.auth?.token) {
      this.token = config.auth.token;
    }

    this.userHttp = createUserInstance({
      baseURL: config.sdpUrl,
      tenantName: config.tenantName,
      timeout: config.timeout,
      getToken: () => this.token,
    });

    if (config.sdpAdminUrl && config.adminAuth) {
      this.adminHttp = createAdminInstance({
        baseURL: config.sdpAdminUrl,
        username: config.adminAuth.username,
        apiKey: config.adminAuth.apiKey,
        timeout: config.timeout,
      });
    }

    this.auth = new AuthService(this.userHttp, (t) => this.setToken(t));
    this.tenants = new TenantsService(this.adminHttp ?? this.userHttp);
    this.organization = new OrganizationService(this.userHttp);
    this.apiKeys = new ApiKeysService(this.userHttp);
    this.assets = new AssetsService(this.userHttp);
    this.receivers = new ReceiversService(this.userHttp);
    this.disbursements = new DisbursementsService(this.userHttp);
    this.payments = new PaymentsService(this.userHttp);
    this.statistics = new StatisticsService(this.userHttp);
    this.balances = new BalancesService(this.userHttp);
  }

  setToken(token: string): void {
    this.token = token;
  }

  clearToken(): void {
    this.token = null;
  }
}
