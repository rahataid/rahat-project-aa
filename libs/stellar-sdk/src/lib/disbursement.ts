import { LOGS } from '../constants/logger';
import { logger } from '../utils/logger';
import { axiosInstance } from './axios/axiosInstance';
import { DISBURSEMENT } from '../constants/routes';
import {
  countryCode,
  smsRegistrationMessageTemplate,
  VERIFICATION,
} from '../constants/constant';
const FormData = require('form-data');

type DisbursementProp = {
  walletType: 'Demo Wallet' | 'Vibrant Wallet';
  verification: VERIFICATION;
  assetCodes: string;
  disbursement_name: string;
};

export const createDisbursement = async ({
  walletType,
  verification,
  assetCodes,
  disbursement_name,
}: DisbursementProp) => {
  const walletRes = await axiosInstance.get(DISBURSEMENT.WALLET);
  const { id: wallet_id } = walletRes.data.find(
    (wallet: any) => wallet.name === walletType
  );

  const asset_res = await axiosInstance.get(DISBURSEMENT.ASSET);
  const { id: asset_id } = asset_res.data.find(
    (asset: any) => asset.code === assetCodes
  );

  const res: any = await axiosInstance.post(DISBURSEMENT.DISBURSEMENT, {
    name: disbursement_name,
    wallet_id,
    asset_id,
    country_code: countryCode,
    verification_field: verification,
    receiver_registration_message_template: smsRegistrationMessageTemplate,
  });

  logger.warn(LOGS.WARN.DISBURSEMENT_SUCCESS);
  return {
    disbursementID: res.data.id,
    assetIssuer: walletRes.data[0].assets[0].issuer,
  };
};

export const updateDisbursementStatus = async (disbursementId: string) => {
  await axiosInstance.patch(DISBURSEMENT.UPDATE(disbursementId), {
    status: 'STARTED',
  });
};

export const uploadDisbursementFile = async (
  disbursementID: string,
  fileBuffer: Buffer,
  fileName: string
) => {
  const formData = new FormData();
  formData.append('file', fileBuffer, fileName);
  await axiosInstance.post(DISBURSEMENT.UPLOAD(disbursementID), formData, {
    headers: {
      ...formData.getHeaders(),
    },
  });
  logger.warn(LOGS.WARN.DISBURSEMENT_SUCCESS);
};
