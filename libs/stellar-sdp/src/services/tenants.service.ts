import { AxiosInstance } from 'axios';
import {
  CreateTenantRequest,
  SetDefaultTenantRequest,
  Tenant,
  UpdateTenantRequest,
} from '../types';

export class TenantsService {
  constructor(private readonly http: AxiosInstance) {}

  async list(): Promise<Tenant[]> {
    const { data } = await this.http.get<Tenant[]>('/tenants');
    return data;
  }

  async get(id: string): Promise<Tenant> {
    const { data } = await this.http.get<Tenant>(`/tenants/${id}`);
    return data;
  }

  async create(request: CreateTenantRequest): Promise<Tenant> {
    const { data } = await this.http.post<Tenant>('/tenants', request);
    return data;
  }

  async update(id: string, request: UpdateTenantRequest): Promise<Tenant> {
    const { data } = await this.http.patch<Tenant>(`/tenants/${id}`, request);
    return data;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(`/tenants/${id}`);
  }

  async setDefault(request: SetDefaultTenantRequest): Promise<unknown> {
    const { data } = await this.http.post('/tenants/default-tenant', request);
    return data;
  }
}
