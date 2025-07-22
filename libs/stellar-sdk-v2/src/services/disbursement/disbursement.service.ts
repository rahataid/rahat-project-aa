import { Asset, Keypair } from '@stellar/stellar-sdk';
import {
  IDisbursementService,
  IDisbursementConfig,
  IDisbursementResult,
  IDisbursement,
} from '../../core/interfaces/disbursement.interface';
import {
  DisbursementCreationError,
  DisbursementNotFoundError,
  DistributionAddressError,
  AssetTransferError,
} from '../../core/errors/disbursement.errors';
import { AuthService } from '../auth.service';
import { DisbursementApiService } from './disbursement-api.service';
import { StellarApiService } from '../stellar-api.service';

export class DisbursementService implements IDisbursementService {
  private readonly authService: AuthService;
  private readonly disbursementApi: DisbursementApiService;
  private readonly stellarApi: StellarApiService;

  constructor(private readonly config: IDisbursementConfig) {
    this.authService = new AuthService({
      tenantName: config.tenantName,
      email: config.email,
      password: config.password,
      baseUrl: config.baseUrl,
    });

    this.disbursementApi = new DisbursementApiService(this.authService);
    this.stellarApi = new StellarApiService(this.authService);
  }

  public async createDisbursementProcess(
    disbursementName: string,
    fileBuffer: Buffer,
    fileName: string,
    amount: string
  ): Promise<IDisbursementResult> {
    try {
      // Get authentication token
      await this.authService.getToken();

      // Create custom asset and fund disbursement account
      await this.createCustomAsset(amount);

      // Create disbursement and update status
      return await this.createDisbursement(
        fileBuffer,
        fileName,
        disbursementName
      );
    } catch (error) {
      if (error instanceof DisbursementCreationError) {
        throw error;
      }
      throw new DisbursementCreationError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        error
      );
    }
  }

  public async getDistributionAddress(tenantName: string): Promise<string> {
    try {
      await this.authService.getToken();
      return await this.disbursementApi.getDistributionAddress(tenantName);
    } catch (error) {
      throw new DistributionAddressError(tenantName, error);
    }
  }

  public async getDisbursement(
    disbursementId: string
  ): Promise<IDisbursement | null> {
    try {
      await this.authService.getToken();
      return await this.disbursementApi.getDisbursement(disbursementId);
    } catch (error) {
      if (error instanceof DisbursementNotFoundError) {
        return null;
      }
      throw error;
    }
  }

  // Create asset before disbursing
  private async createCustomAsset(amount: string): Promise<void> {
    try {
      const issuerKeypair = Keypair.fromSecret(this.config.assetSecret);
      const asset = new Asset(this.config.assetCode, issuerKeypair.publicKey());

      // Create asset on the platform
      await this.stellarApi.createAsset(
        this.config.assetCode,
        this.config.assetIssuer
      );

      // Get distribution address and transfer assets
      const distributionAddress = await this.getDistributionAddress(
        this.config.tenantName
      );

      await this.stellarApi.transferAsset(
        distributionAddress,
        asset,
        amount,
        this.config.assetSecret,
        this.config.horizonServer,
        this.config.network
      );
    } catch (error) {
      throw new AssetTransferError(
        this.config.assetCode,
        'distribution account',
        error
      );
    }
  }

  private async createDisbursement(
    fileBuffer: Buffer,
    fileName: string,
    disbursementName: string
  ): Promise<IDisbursementResult> {
    try {
      const disbursement = await this.disbursementApi.createDisbursement({
        disbursementName,
        fileBuffer,
        fileName,
        assetCode: this.config.assetCode,
      });

      await this.disbursementApi.updateDisbursementStatus(
        disbursement.disbursementID
      );

      return disbursement;
    } catch (error) {
      throw new DisbursementCreationError(
        error instanceof Error
          ? error.message
          : 'Failed to create disbursement',
        error
      );
    }
  }
}
