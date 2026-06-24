import { AxiosInstance } from 'axios';
import * as FormData from 'form-data';
import {
  CreateDisbursementRequest,
  Disbursement,
  DisbursementListParams,
  DisbursementReceiverListParams,
  PaginatedResponse,
  RegistrationContactType,
  UpdateDisbursementStatusRequest,
} from '../types';

export class DisbursementsService {
  constructor(private readonly http: AxiosInstance) {}

  async list(
    params?: DisbursementListParams
  ): Promise<PaginatedResponse<Disbursement>> {
    const { data } = await this.http.get<PaginatedResponse<Disbursement>>(
      '/disbursements',
      { params }
    );
    return data;
  }

  async get(id: string): Promise<Disbursement> {
    const { data } = await this.http.get<Disbursement>(
      `/disbursements/${id}`
    );
    return data;
  }

  async create(request: CreateDisbursementRequest): Promise<Disbursement> {
    const { file, filename, ...metadata } = request;

    const formData = new FormData();
    formData.append('data', JSON.stringify(metadata));
    formData.append('file', file, {
      filename: filename || 'instructions.csv',
      contentType: 'text/csv',
    });

    const { data } = await this.http.post<Disbursement>(
      '/disbursements',
      formData,
      { headers: { ...formData.getHeaders() } }
    );
    return data;
  }

  async updateStatus(
    id: string,
    request: UpdateDisbursementStatusRequest
  ): Promise<Disbursement> {
    const { data } = await this.http.patch<Disbursement>(
      `/disbursements/${id}/status`,
      request
    );
    return data;
  }

  async delete(id: string): Promise<void> {
    await this.http.delete(`/disbursements/${id}`);
  }

  async listReceivers(
    disbursementId: string,
    params?: DisbursementReceiverListParams
  ): Promise<PaginatedResponse<unknown>> {
    const { data } = await this.http.get(
      `/disbursements/${disbursementId}/receivers`,
      { params }
    );
    return data;
  }

  async uploadInstructions(
    disbursementId: string,
    file: Buffer,
    filename: string
  ): Promise<unknown> {
    const formData = new FormData();
    formData.append('file', file, {
      filename,
      contentType: 'text/csv',
    });

    const { data } = await this.http.post(
      `/disbursements/${disbursementId}/instructions`,
      formData,
      { headers: { ...formData.getHeaders() } }
    );
    return data;
  }

  async downloadInstructions(disbursementId: string): Promise<Buffer> {
    const { data } = await this.http.get(
      `/disbursements/${disbursementId}/instructions`,
      { responseType: 'arraybuffer' }
    );
    return data;
  }

  async listRegistrationContactTypes(): Promise<RegistrationContactType[]> {
    const { data } = await this.http.get<RegistrationContactType[]>(
      '/registration-contact-types'
    );
    return data;
  }
}
