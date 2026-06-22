import { AxiosInstance } from 'axios';
import { Statistics } from '../types';

export class StatisticsService {
  constructor(private readonly http: AxiosInstance) {}

  async getAll(): Promise<Statistics> {
    const { data } = await this.http.get<Statistics>('/statistics');
    return data;
  }

  async getByDisbursement(disbursementId: string): Promise<Statistics> {
    const { data } = await this.http.get<Statistics>(
      `/statistics/${disbursementId}`
    );
    return data;
  }
}
