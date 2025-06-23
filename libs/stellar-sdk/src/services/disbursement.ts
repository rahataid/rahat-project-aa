import { Asset, Keypair } from '@stellar/stellar-sdk';
import { DISBURSEMENT, horizonServer, WALLETS } from '../constants/constant';
import {
  createDisbursement,
  updateDisbursementStatus,
  getDisbursement,
} from '../lib/disbursement';
import { transfer_asset } from '../lib/transferAsset';
import { AuthService } from '../lib/login';
import { getAxiosInstances } from '../lib/axios/axiosInstance';
import { getDistributionAddress } from '../utils/getDistributionAddress';
import { STELLAR } from '../constants/routes';
import { IDisbursementService, IDisbursement } from '../types';

export let token: string;
export class DisbursementServices implements IDisbursementService {
  private walletType: WALLETS;

  constructor(private disbursementValues: any) {
    this.walletType = DISBURSEMENT.WalletType;
  }

  public async createDisbursementProcess(
    disbursementName: string,
    fileBuffer: Buffer,
    fileName: string,
    amount: string
  ): Promise<any> {
    const authService = new AuthService(
      this.disbursementValues.tenantName,
      this.disbursementValues.email,
      this.disbursementValues.password,
      this.disbursementValues.baseUrl
    );

    token = (await authService.getToken()) as string;

    await this.custom_asset(amount.toString(), this.disbursementValues.baseUrl);
    return this.disbursement(fileBuffer, fileName, disbursementName);
  }

  public async getDistributionAddress(tenantName: string) {
    return await getDistributionAddress(tenantName);
  }

  public async getDisbursement(
    disbursementId: string
  ): Promise<IDisbursement | null> {
    const authService = new AuthService(
      this.disbursementValues.tenantName,
      this.disbursementValues.email,
      this.disbursementValues.password,
      this.disbursementValues.baseUrl
    );

    console.log('settings=>', this.disbursementValues);

    token = (await authService.getToken()) as string;
    const disbursement = await getDisbursement(
      disbursementId,
      this.disbursementValues.baseUrl
    );
    return disbursement;
  }

  // Creates custom asset and fund disbursement account
  private async custom_asset(amount: string, baseUrl: string) {
    const { axiosInstance } = getAxiosInstances({
      baseUrl,
    });

    const issuerKeypair = Keypair.fromSecret(
      this.disbursementValues.assetSecret
    );
    const asset = new Asset(
      this.disbursementValues.assetCode,
      issuerKeypair.publicKey()
    );

    await axiosInstance.post(STELLAR.ASSET, {
      code: this.disbursementValues.assetCode,
      issuer: this.disbursementValues.assetIssuer,
    });
    const disbursementAddress = await getDistributionAddress(
      this.disbursementValues.tenantName
    );
    await transfer_asset(
      disbursementAddress,
      asset,
      amount,
      this.disbursementValues.assetSecret,
      horizonServer
    );
  }

  // Create disbursement and update status
  private async disbursement(
    fileBuffer: Buffer,
    fileName: string,
    disbursementName: string
  ) {
    try {
      const disbursement = await createDisbursement({
        walletType: this.walletType,
        assetCodes: this.disbursementValues.assetCode,
        disbursement_name: disbursementName,
        fileBuffer,
        fileName,
        baseUrl: this.disbursementValues.baseUrl,
      });

      const disbursementID = disbursement?.disbursementID;
      await updateDisbursementStatus(
        disbursementID,
        this.disbursementValues.baseUrl
      );
      return disbursement;
    } catch (error) {
      console.log(error);
      throw new Error(`Error creating disbursement: ${error}`);
    }
  }
}
