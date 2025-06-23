import axios from 'axios';

const createAxiosInstance = (baseURL: string, timeout: number = 5000) => {
  return axios.create({
    baseURL,
    timeout,
  });
};

export const getAxiosInstances = (
  config: {
    baseUrl?: string;
    stellarDemoWalletUrl?: string;
    receiverBaseUrl?: string;
  } = {}
) => {
  const instances: { ag?: any; as?: any; ar?: any } = {};

  if (config.baseUrl) {
    instances.ag = createAxiosInstance(config.baseUrl, 50000);
  }
  if (config.stellarDemoWalletUrl) {
    instances.as = createAxiosInstance(config.stellarDemoWalletUrl);
  }
  if (config.receiverBaseUrl) {
    instances.ar = createAxiosInstance(config.receiverBaseUrl);
  }

  return instances;
};
