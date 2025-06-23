import { LOGS } from '../constants/logger';
import { logger } from '../utils/logger';
import { getAxiosInstances } from './axios/axiosGuest';
import { AUTH } from '../constants/routes';

export class AuthService {
  private tenantName: string;
  private email: string;
  private password: string;
  private token: string | null;
  private baseUrl: string;

  constructor(
    tenantName: string,
    email: string,
    password: string,
    baseUrl: string
  ) {
    this.tenantName = tenantName;
    this.email = email;
    this.password = password;
    this.token = null;
    this.baseUrl = baseUrl;
  }

  public async login(): Promise<void> {
    const { ag } = getAxiosInstances({
      baseUrl: this.baseUrl,
    });
    const response = await ag.post(
      AUTH.LOGIN,
      {
        email: this.email,
        password: this.password,
      },
      { headers: { ['Sdp-Tenant-Name']: this.tenantName } }
    );

    this.token = response.data.token;
    logger.info(LOGS.INFO.LOGIN);
  }

  public async getToken(): Promise<string | null> {
    if (!this.token) {
      logger.info(LOGS.WARN.LOGIN);
      await this.login();
    }
    return this.token;
  }

  public clearToken(): void {
    this.token = null;
  }
}
