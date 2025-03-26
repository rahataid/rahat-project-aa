import axios from 'axios';
import { sdpAuth } from '../../constants/constant';

require('dotenv').config();

const ait = axios.create({
  baseURL: process.env['ADMIN_BASE_URL'],
  timeout: 50000,
});

ait.interceptors.request.use(
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

export { ait };
