import { AxiosInstance } from 'axios';
import { AuthService } from '../auth.service';
import { API_ROUTES } from '../../constants/routes';
import {
  DisbursementCreationError,
  DisbursementNotFoundError,
} from '../../core/errors/disbursement.errors';
import {
  IDisbursement,
  IDisbursementResult,
} from '../../core/interfaces/disbursement.interface';

const FormData = require('form-data');

interface CreateDisbursementParams {
  disbursementName: string;
  fileBuffer: Buffer;
  fileName: string;
  assetCode: string;
}

export class DisbursementApiService {
  private get axiosInstance(): AxiosInstance {
    return this.authService.getAxiosInstance();
  }

  constructor(private readonly authService: AuthService) {}

  public async getDistributionAddress(tenantName: string): Promise<string> {
    try {
      const response = await this.axiosInstance.get(
        API_ROUTES.STELLAR.ORGANIZATION
      );
      const organization = response.data;
      if (!organization || organization.name !== tenantName) {
        throw new Error(`No organization found with name: ${tenantName}`);
      }
      return organization.distribution_account_public_key;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new Error(`No organization found with name: ${tenantName}`);
      }
      throw error;
    }
  }

  public async createDisbursement(
    params: CreateDisbursementParams
  ): Promise<IDisbursementResult> {
    try {
      // Get wallet and asset information
      const [walletResponse, assetResponse] = await Promise.all([
        this.axiosInstance.get(API_ROUTES.DISBURSEMENT.WALLET),
        this.axiosInstance.get(API_ROUTES.DISBURSEMENT.ASSET),
      ]);

      const asset = assetResponse.data.find(
        (a: any) => a.code === params.assetCode
      );
      if (!asset) {
        throw new Error(`Asset with code ${params.assetCode} not found`);
      }

      const formDataObject = {
        name: params.disbursementName,
        wallet_id: '',
        asset_id: asset.id,
        registration_contact_type: 'PHONE_NUMBER_AND_WALLET_ADDRESS',
        verification_field: '',
        receiver_registration_message_template: '',
      };

      const formData = new FormData();
      formData.append('data', JSON.stringify(formDataObject));
      formData.append('file', params.fileBuffer, {
        filename: 'beneficiaries.csv',
        contentType: 'text/csv',
      });

      const response = await this.axiosInstance.post(
        API_ROUTES.DISBURSEMENT.DISBURSEMENT,
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
        }
      );

      return {
        disbursementID: response.data.id,
        assetIssuer: walletResponse.data[0].assets[0].issuer,
      };
    } catch (error: any) {
      if (error.response?.data) {
        const { error: errorMessage, extras } = error.response.data;
        let formattedError = errorMessage;

        if (extras && typeof extras === 'object') {
          const extraMessages = Object.entries(extras)
            .map(([key, value]) => `${key}: ${value}`)
            .join('; ');
          formattedError += ` - Details: ${extraMessages}`;
        }
        throw new DisbursementCreationError(formattedError);
      }
      throw new DisbursementCreationError(error.message);
    }
  }

  public async updateDisbursementStatus(disbursementId: string): Promise<void> {
    try {
      await this.axiosInstance.patch(
        API_ROUTES.DISBURSEMENT.UPDATE(disbursementId),
        {
          status: 'STARTED',
        }
      );
    } catch (error: any) {
      throw new DisbursementCreationError(
        `Failed to update disbursement status: ${error.message}`
      );
    }
  }

  public async getDisbursement(
    disbursementId: string
  ): Promise<IDisbursement | null> {
    try {
      const response = await this.axiosInstance.get(
        API_ROUTES.DISBURSEMENT.GET(disbursementId)
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throw new DisbursementNotFoundError(disbursementId);
      }
      throw error;
    }
  }
}
