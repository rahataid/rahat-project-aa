import { LOGS } from '../../constants/logger';
import { logger } from '../../logger';
import { AUTH } from '../../routes/auth';
import { ag } from '../../utils/axiosGuest';

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
    try {
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
    } catch (error: any) {
      logger.error(LOGS.ERROR.LOGIN(error));
      throw new Error(LOGS.ERROR.LOGIN(error));
    }
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
