import { AxiosInstance } from 'axios';
import { Asset, CreateAssetRequest } from '../types';

export class AssetsService {
  constructor(private readonly http: AxiosInstance) {}

  async list(): Promise<Asset[]> {
    const { data } = await this.http.get<Asset[]>('/assets');
    return data;
  }

  async create(request: CreateAssetRequest): Promise<Asset> {
    const { data } = await this.http.post<Asset>('/assets', request);
    return data;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(`/assets/${id}`);
  }
}
