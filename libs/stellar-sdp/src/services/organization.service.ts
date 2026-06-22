import { AxiosInstance } from 'axios';
import { Organization, UpdateOrganizationRequest } from '../types';
import * as FormData from 'form-data';

export class OrganizationService {
  constructor(private readonly http: AxiosInstance) {}

  async get(): Promise<Organization> {
    const { data } = await this.http.get<Organization>('/organization');
    return data;
  }

  async update(request: UpdateOrganizationRequest): Promise<Organization> {
    const formData = new FormData();

    const { logo, ...rest } = request;
    formData.append('data', JSON.stringify(rest));
    if (logo) {
      formData.append('logo', logo, { filename: 'logo.png' });
    }

    const { data } = await this.http.patch<Organization>(
      '/organization',
      formData,
      { headers: { ...formData.getHeaders() } }
    );
    return data;
  }

  async getLogo(): Promise<Buffer> {
    const { data } = await this.http.get('/organization/logo', {
      responseType: 'arraybuffer',
    });
    return data;
  }
}
