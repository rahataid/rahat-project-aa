import { AxiosInstance } from 'axios';
import {
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  MfaRequest,
  ResetPasswordRequest,
} from '../types';

export class AuthService {
  constructor(
    private readonly http: AxiosInstance,
    private readonly onToken: (token: string) => void
  ) {}

  async login(request: LoginRequest): Promise<LoginResponse> {
    const { data } = await this.http.post<LoginResponse>('/login', request);
    if (data.token) {
      this.onToken(data.token);
    }
    return data;
  }

  async refreshToken(): Promise<LoginResponse> {
    const { data } = await this.http.post<LoginResponse>('/refresh-token');
    if (data.token) {
      this.onToken(data.token);
    }
    return data;
  }

  async mfa(request: MfaRequest): Promise<LoginResponse> {
    const { data } = await this.http.post<LoginResponse>('/mfa', request);
    if (data.token) {
      this.onToken(data.token);
    }
    return data;
  }

  async forgotPassword(request: ForgotPasswordRequest): Promise<unknown> {
    const { data } = await this.http.post('/forgot-password', request);
    return data;
  }

  async resetPassword(request: ResetPasswordRequest): Promise<unknown> {
    const { data } = await this.http.post('/reset-password', request);
    return data;
  }
}
