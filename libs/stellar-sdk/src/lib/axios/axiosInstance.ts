import axios from 'axios';
import { token } from '../../services/disbursement';
import { SdkConfigManager } from '../../config';

let axiosInstanceInternal: ReturnType<typeof axios.create> | null = null;

const createAxiosInstance = () => {
  if (!axiosInstanceInternal) {
    const { baseUrl } = SdkConfigManager.getInstance().getConfig();
    axiosInstanceInternal = axios.create({
      baseURL: baseUrl,
      timeout: 15000,
    });

    axiosInstanceInternal.interceptors.request.use(
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
  }
  return axiosInstanceInternal;
};

export const axiosInstance = new Proxy({} as ReturnType<typeof axios.create>, {
  get(target, prop, receiver) {
    const instance = createAxiosInstance();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
