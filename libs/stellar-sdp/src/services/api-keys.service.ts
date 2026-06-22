import { AxiosInstance } from 'axios';
import { ApiKey, CreateApiKeyRequest, UpdateApiKeyRequest } from '../types';

export class ApiKeysService {
  constructor(private readonly http: AxiosInstance) {}

  async list(): Promise<ApiKey[]> {
    const { data } = await this.http.get<ApiKey[]>('/api-keys');
    return data;
  }

  async get(id: string): Promise<ApiKey> {
    const { data } = await this.http.get<ApiKey>(`/api-keys/${id}`);
    return data;
  }

  async create(request: CreateApiKeyRequest): Promise<ApiKey> {
    const { data } = await this.http.post<ApiKey>('/api-keys', request);
    return data;
  }

  async update(id: string, request: UpdateApiKeyRequest): Promise<ApiKey> {
    const { data } = await this.http.patch<ApiKey>(
      `/api-keys/${id}`,
      request
    );
    return data;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(`/api-keys/${id}`);
  }
}
