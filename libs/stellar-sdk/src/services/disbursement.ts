import { Asset, Keypair } from '@stellar/stellar-sdk';
import { ASSET, DISBURSEMENT, WALLETS } from '../constants/constant';
import {
  createDisbursement,
  updateDisbursementStatus,
  uploadDisbursementFile,
} from '../lib/disbursement';
import { transfer_asset } from '../lib/transferAsset';
import { AuthService } from '../lib/login';
import { axiosInstance } from '../lib/axios/axiosInstance';
import { getDistributionAddress } from '../utils/getDistributionAddress';
import { STELLAR } from '../constants/routes';
import { IDisbursementService } from '../types';

export let token: string;
export class DisbursementServices implements IDisbursementService {
  private walletType: WALLETS;

  constructor(
    private email: string,
    private password: string,
    private tenantName: string
  ) {
    this.walletType = DISBURSEMENT.WalletType;
  }

  public async createDisbursementProcess(
    disbursementName: string,
    fileBuffer: Buffer,
    fileName: string,
    amount: string
  ): Promise<any> {
    const authService = new AuthService(
      this.tenantName,
      this.email,
      this.password
    );

    token = (await authService.getToken()) as string;

    await this.custom_asset(amount.toString());
    return this.disbursement(fileBuffer, fileName, disbursementName);
  }

  public async getDistributionAddress(tenantName: string) {
    return await getDistributionAddress(tenantName);
  }

  // Creates custom asset and fund disbursement account
  private async custom_asset(amount: string) {
    const issuerKeypair = Keypair.fromSecret(ASSET.SECERT);
    const asset = new Asset(ASSET.NAME, issuerKeypair.publicKey());

    await axiosInstance.post(STELLAR.ASSET, {
      code: ASSET.NAME,
      issuer: ASSET.ISSUER,
    });
    const disbursementAddress = await getDistributionAddress(this.tenantName);
    await transfer_asset(disbursementAddress, asset, amount);
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
        assetCodes: ASSET.NAME,
        disbursement_name: disbursementName,
        fileBuffer,
        fileName,
      });

      const disbursementID = disbursement?.disbursementID;
      await updateDisbursementStatus(disbursementID);
      return disbursement;
    } catch (error) {
      console.log(error);
      throw new Error(`Error creating disbursement: ${error}`);
    }
  }
}
