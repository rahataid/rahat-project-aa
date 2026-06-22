import { AxiosInstance } from 'axios';
import {
  CreateReceiverRequest,
  PaginatedResponse,
  Receiver,
  ReceiverListParams,
  UpdateReceiverRequest,
  UpdateReceiverWalletRequest,
  UpdateReceiverWalletStatusRequest,
  VerificationType,
} from '../types';

export class ReceiversService {
  constructor(private readonly http: AxiosInstance) {}

  async list(
    params?: ReceiverListParams
  ): Promise<PaginatedResponse<Receiver>> {
    const { data } = await this.http.get<PaginatedResponse<Receiver>>(
      '/receivers',
      { params }
    );
    return data;
  }

  async get(id: string): Promise<Receiver> {
    const { data } = await this.http.get<Receiver>(`/receivers/${id}`);
    return data;
  }

  async create(request: CreateReceiverRequest): Promise<Receiver> {
    const { data } = await this.http.post<Receiver>('/receivers', request);
    return data;
  }

  async update(
    id: string,
    request: UpdateReceiverRequest
  ): Promise<Receiver> {
    const { data } = await this.http.patch<Receiver>(
      `/receivers/${id}`,
      request
    );
    return data;
  }

  async updateWallet(
    receiverId: string,
    walletId: string,
    request: UpdateReceiverWalletRequest
  ): Promise<unknown> {
    const { data } = await this.http.patch(
      `/receivers/${receiverId}/wallets/${walletId}`,
      request
    );
    return data;
  }

  async updateWalletStatus(
    walletId: string,
    request: UpdateReceiverWalletStatusRequest
  ): Promise<unknown> {
    const { data } = await this.http.patch(
      `/receivers/wallets/${walletId}/status`,
      request
    );
    return data;
  }

  async listVerificationTypes(): Promise<VerificationType[]> {
    const { data } = await this.http.get<VerificationType[]>(
      '/receivers/verification-types'
    );
    return data;
  }
}
