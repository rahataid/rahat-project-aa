export interface SdpClientConfig {
  sdpUrl: string;
  sdpAdminUrl?: string;
  tenantName?: string;
  apiKey?: string;
  auth?: {
    token?: string;
    email?: string;
    password?: string;
  };
  adminAuth?: {
    username: string;
    apiKey: string;
  };
  timeout?: number;
}
