import axios from 'axios';
import { token } from '../../services/disbursement';
import { sdpAuth } from '../../constants/constant';

const createAxiosInstance = (
  baseURL: string,
  timeout: number = 15000,
  useAdminAuth: boolean = false
) => {
  const instance = axios.create({
    baseURL,
    timeout,
  });

  instance.interceptors.request.use(
    async (config: any) => {
      if (useAdminAuth) {
        // Use admin authentication (Basic Auth)
        const credentials = `${sdpAuth.USERNAME}:${sdpAuth.API_KEY}`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');
        if (encodedCredentials) {
          config.headers['Authorization'] = `Basic ${encodedCredentials}`;
        }
      } else {
        // Use Bearer token authentication
        if (token) {
          config.headers['Authorization'] = `Bearer ${token}`;
        }
      }
      return config;
    },
    (error: any) => {
      return Promise.reject(error);
    }
  );

  return instance;
};

export const getAxiosInstances = (
  config: {
    baseUrl?: string;
    adminBaseUrl?: string;
  } = {}
) => {
  const instances: { axiosInstance?: any; adminAxiosInstance?: any } = {};

  if (config.baseUrl) {
    instances.axiosInstance = createAxiosInstance(config.baseUrl);
  }

  if (config.adminBaseUrl) {
    instances.adminAxiosInstance = createAxiosInstance(
      config.adminBaseUrl,
      15000,
      true
    );
  }

  return instances;
};
