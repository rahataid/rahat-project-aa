import axios from 'axios';
import { sdpAuth } from '../../constants/constant';
import { SdkConfigManager } from '../../config';

let aitInstance: ReturnType<typeof axios.create> | null = null;
const createAitInstance = () => {
  if (!aitInstance) {
    const { adminBaseUrl } = SdkConfigManager.getInstance().getConfig();
    aitInstance = axios.create({
      baseURL: adminBaseUrl,
      timeout: 150000,
    });

    aitInstance.interceptors.request.use(
      async (config: any) => {
        const credentials = `${sdpAuth.USERNAME}:${sdpAuth.API_KEY}`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');
        if (encodedCredentials) {
          config.headers['Authorization'] = `Basic ${encodedCredentials}`;
        }
        return config;
      },
      (error: any) => {
        return Promise.reject(error);
      }
    );
  }
  return aitInstance;
};

export const ait = new Proxy({} as ReturnType<typeof axios.create>, {
  get(target, prop, receiver) {
    const instance = createAitInstance();
    const value = Reflect.get(instance, prop, receiver);
    return typeof value === 'function' ? value.bind(instance) : value;
  },
});
