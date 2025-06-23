import axios from 'axios';
import { token } from '../../services/disbursement';

const createAxiosInstance = (baseURL: string, timeout: number = 15000) => {
  const instance = axios.create({
    baseURL,
    timeout,
  });

  instance.interceptors.request.use(
    async (config: any) => {
      if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
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
  } = {}
) => {
  const instances: { axiosInstance?: any } = {};

  if (config.baseUrl) {
    instances.axiosInstance = createAxiosInstance(config.baseUrl);
  }

  return instances;
};
