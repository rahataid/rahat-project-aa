const axios = require('axios');
import { token } from '../../services/disbursement';

console.log('token', token);

const axiosInstance = axios.create({
  baseURL: process.env['BASE_URL'],
  timeout: 15000,
});
axiosInstance.interceptors.request.use(
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

export { axiosInstance };
