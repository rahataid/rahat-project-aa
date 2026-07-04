import axios, { AxiosInstance } from 'axios';

const DEFAULT_TIMEOUT = 15000;

export function createUserInstance(options: {
  baseURL: string;
  tenantName?: string;
  timeout?: number;
  getToken: () => string | null;
}): AxiosInstance {
  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
  });

  instance.interceptors.request.use((config) => {
    const token = options.getToken();
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    if (options.tenantName) {
      config.headers['SDP-Tenant-Name'] = options.tenantName;
    }
    return config;
  });

  return instance;
}
