import { AxiosInstance } from 'axios';
import { Balance } from '../types';

export class BalancesService {
  constructor(private readonly http: AxiosInstance) {}

  async get(): Promise<Balance> {
    const { data } = await this.http.get<Balance>('/balances');
    return data;
  }
}
