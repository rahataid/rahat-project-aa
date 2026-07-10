import axios, { AxiosInstance } from 'axios';

const DEFAULT_TIMEOUT = 15000;

export function createAdminInstance(options: {
  baseURL: string;
  username: string;
  apiKey: string;
  timeout?: number;
}): AxiosInstance {
  const encoded = Buffer.from(
    `${options.username}:${options.apiKey}`
  ).toString('base64');

  const instance = axios.create({
    baseURL: options.baseURL,
    timeout: options.timeout ?? DEFAULT_TIMEOUT,
  });

  instance.interceptors.request.use((config) => {
    config.headers['Authorization'] = `Basic ${encoded}`;
    return config;
  });

  return instance;
}
