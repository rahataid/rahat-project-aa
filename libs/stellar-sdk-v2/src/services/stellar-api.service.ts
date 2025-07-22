import { Asset } from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { API_ROUTES } from '../constants/routes';
import { AssetTransferError } from '../core/errors/disbursement.errors';
import { transferAsset } from '../utils/stellar.utils';

export class StellarApiService {
  private get axiosInstance() {
    return this.authService.getAxiosInstance();
  }

  constructor(private readonly authService: AuthService) {}

  public async createAsset(
    assetCode: string,
    assetIssuer: string
  ): Promise<void> {
    try {
      await this.axiosInstance.post(API_ROUTES.STELLAR.ASSET, {
        code: assetCode,
        issuer: assetIssuer,
      });
    } catch (error: any) {
      if (error.response?.status === 409) {
        // Asset already exists, this is fine
        return;
      }
      throw new Error(`Failed to create asset: ${error.message}`);
    }
  }

  public async transferAsset(
    destinationAddress: string,
    asset: Asset,
    amount: string,
    assetSecret: string,
    horizonServer: string,
    network: string
  ): Promise<void> {
    try {
      await transferAsset(
        destinationAddress,
        asset,
        amount,
        assetSecret,
        horizonServer,
        network
      );
    } catch (error: any) {
      throw new AssetTransferError(asset.getCode(), destinationAddress, error);
    }
  }
}
