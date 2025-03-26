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
    private tenantName: string,
    private disbursementName: string,
    private file: File
  ) {
    this.walletType = DISBURSEMENT.WalletType;
  }

  public async createDisbursementProcess(): Promise<any> {
    const authService = new AuthService(
      this.tenantName,
      this.email,
      this.password
    );
    token = (await authService.getToken()) as string;
    await this.custom_asset();
    return this.disbursement(this.file);
  }

  // Creates custom asset and fund disbursement account
  private async custom_asset() {
    const issuerKeypair = Keypair.fromSecret(ASSET.SECERT);
    const asset = new Asset(ASSET.NAME, issuerKeypair.publicKey());

    await axiosInstance.post(STELLAR.ASSET, {
      code: ASSET.NAME,
      issuer: ASSET.ISSUER,
    });
    const disbursementAddress = await getDistributionAddress(this.tenantName);
    await transfer_asset(disbursementAddress, asset);
  }

  // Create disbursement and update status
  private async disbursement(file: File) {
    const disbursement = await createDisbursement({
      walletType: this.walletType,
      verification: DISBURSEMENT.VERIFICATION,
      assetCodes: ASSET.NAME,
      disbursement_name: this.disbursementName,
    });

    const disbursementID = disbursement?.disbursementID;

    await uploadDisbursementFile(disbursementID, file);
    await updateDisbursementStatus(disbursementID);

    return disbursement;
  }
}
