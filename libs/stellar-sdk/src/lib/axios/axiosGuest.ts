import axios from 'axios';
import { SdkConfigManager } from '../../config';

let agInstance: ReturnType<typeof axios.create> | null = null;
let asInstance: ReturnType<typeof axios.create> | null = null;
let arInstance: ReturnType<typeof axios.create> | null = null;
let friendbotInstance: ReturnType<typeof axios.create> | null = null;

export const ag = () => {
  if (!agInstance) {
    const { baseUrl } = SdkConfigManager.getInstance().getConfig();
    agInstance = axios.create({ baseURL: baseUrl, timeout: 150000 });
  }
  return agInstance;
};

export const as = () => {
  if (!asInstance) {
    const { processUrl } = SdkConfigManager.getInstance().getConfig();
    asInstance = axios.create({ baseURL: processUrl, timeout: 15000 });
  }
  return asInstance;
};

export const ar = () => {
  if (!arInstance) {
    const { receiverUrl } = SdkConfigManager.getInstance().getConfig();
    arInstance = axios.create({ baseURL: receiverUrl, timeout: 15000 });
  }
  return arInstance;
};

export const friendbot = () => {
  if (!friendbotInstance) {
    const { friendbotUrl } = SdkConfigManager.getInstance().getConfig();
    friendbotInstance = axios.create({ baseURL: friendbotUrl, timeout: 15000 });
  }
  return friendbotInstance;
};
