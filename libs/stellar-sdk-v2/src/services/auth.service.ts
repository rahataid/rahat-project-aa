import axios, { AxiosInstance } from 'axios';
import {
  IAuthService,
  IAuthConfig,
  IAuthResult,
} from '../core/interfaces/auth.interface';
import { AuthenticationError } from '../core/errors/disbursement.errors';
import { API_ROUTES } from '../constants/routes';

export class AuthService implements IAuthService {
  private token: string | null = null;
  private tokenExpiry: Date | null = null;
  private readonly axiosInstance: AxiosInstance;

  constructor(private readonly config: IAuthConfig) {
    this.axiosInstance = axios.create({
      baseURL: config.baseUrl,
      timeout: 10000,
    });

    // Attach token to all outgoing requests
    this.axiosInstance.interceptors.request.use(
      async (requestConfig: any) => {
        if (this.token) {
          requestConfig.headers = requestConfig.headers || {};
          requestConfig.headers['Authorization'] = `Bearer ${this.token}`;
        }
        return requestConfig;
      },
      (error: any) => Promise.reject(error)
    );
  }

  public async getToken(): Promise<string> {
    if (this.isAuthenticated()) {
      return this.token!;
    }

    try {
      const headers: any = { 'Sdp-Tenant-Name': this.config.tenantName };
      if (this.config.referer) {
        headers['referer'] = this.config.referer;
      }
      const response = await this.axiosInstance.post(
        API_ROUTES.AUTH.LOGIN,
        {
          email: this.config.email,
          password: this.config.password,
        },
        { headers }
      );

      if (!response.data?.token) {
        throw new AuthenticationError('No token received from server');
      }

      this.token = response.data.token as string;
      this.tokenExpiry = response.data.expiresAt
        ? new Date(response.data.expiresAt)
        : new Date(Date.now() + 24 * 6 * 1000); // Default 2 mins

      return this.token;
    } catch (error: any) {
      if (error.response?.data) {
        const { error: errorMessage, extras } = error.response.data;
        let formattedError = errorMessage;

        if (extras && typeof extras === 'object') {
          const extraMessages = Object.entries(extras)
            .map(([key, value]) => `${key}: ${value}`)
            .join('; ');
          formattedError += ` - Details: ${extraMessages}`;
        }
        throw new AuthenticationError(formattedError);
      }

      throw new AuthenticationError(error.message || 'Authentication failed');
    }
  }

  public isAuthenticated(): boolean {
    if (!this.token || !this.tokenExpiry) {
      return false;
    }

    // Check if token is expired (with 5 minute buffer)
    const now = new Date();
    const bufferTime = 1 * 60 * 1000; // 1 minutes
    return this.tokenExpiry.getTime() > now.getTime() + bufferTime;
  }

  public getAxiosInstance(): AxiosInstance {
    return this.axiosInstance;
  }
}
