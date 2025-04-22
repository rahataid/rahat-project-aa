import axios from "axios";

export const ag = axios.create({
  baseURL: process.env['BASE_URL'],
  timeout: 50000,
});

export const as = axios.create({
  baseURL: process.env['STELLAR_DEMO_WALLET'],
  timeout: 5000,
});

export const ar = axios.create({
  baseURL: process.env['RECERIVER_BASE_URL'],
  timeout: 5000,
});