import { LOGS } from '../constants/logger';
import { logger } from '../utils/logger';
import { ag } from './axios/axiosGuest';
import { AUTH } from '../constants/routes';

export class AuthService {
  private tenantName: string;
  private email: string;
  private password: string;
  private token: string | null;

  constructor(tenantName: string, email: string, password: string) {
    this.tenantName = tenantName;
    this.email = email;
    this.password = password;
    this.token = null;
  }

  public async login(): Promise<void> {
    const response = await ag().post(
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
