export interface IAuthService {
  getToken(): Promise<string>;
  isAuthenticated(): boolean;
}

export interface IAuthConfig {
  tenantName: string;
  email: string;
  password: string;
  baseUrl: string;
  referer?: string;
}

export interface IAuthResult {
  token: string;
  expiresAt?: Date;
}
