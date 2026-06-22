import { AxiosInstance } from 'axios';
import {
  CreateDirectPaymentRequest,
  PaginatedResponse,
  Payment,
  PaymentListParams,
  RetryPaymentsRequest,
  UpdatePaymentStatusRequest,
} from '../types';

export class PaymentsService {
  constructor(private readonly http: AxiosInstance) {}

  async list(
    params?: PaymentListParams
  ): Promise<PaginatedResponse<Payment>> {
    const { data } = await this.http.get<PaginatedResponse<Payment>>(
      '/payments',
      { params }
    );
    return data;
  }

  async get(id: string): Promise<Payment> {
    const { data } = await this.http.get<Payment>(`/payments/${id}`);
    return data;
  }

  async createDirect(request: CreateDirectPaymentRequest): Promise<Payment> {
    const { data } = await this.http.post<Payment>('/payments', request);
    return data;
  }

  async retry(request: RetryPaymentsRequest): Promise<unknown> {
    const { data } = await this.http.patch('/payments/retry', request);
    return data;
  }

  async updateStatus(
    id: string,
    request: UpdatePaymentStatusRequest
  ): Promise<unknown> {
    const { data } = await this.http.patch(
      `/payments/${id}/status`,
      request
    );
    return data;
  }
}
