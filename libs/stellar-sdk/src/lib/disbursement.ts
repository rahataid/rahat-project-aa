import { LOGS } from '../constants/logger';
import { logger } from '../utils/logger';
import { getAxiosInstances } from './axios/axiosInstance';
import { DISBURSEMENT } from '../constants/routes';

const FormData = require('form-data');

type DisbursementProp = {
  walletType: 'Demo Wallet' | 'Vibrant Wallet';
  assetCodes: string;
  disbursement_name: string;
  fileBuffer: Buffer;
  fileName: string;
  baseUrl: string;
};

export const createDisbursement = async ({
  assetCodes,
  disbursement_name,
  fileBuffer,
  baseUrl,
}: DisbursementProp) => {
  try {
    const { axiosInstance } = getAxiosInstances({
      baseUrl,
    });
    const walletRes = await axiosInstance.get(DISBURSEMENT.WALLET);

    const asset_res = await axiosInstance.get(DISBURSEMENT.ASSET);
    const { id: asset_id } = asset_res.data.find(
      (asset: any) => asset.code === assetCodes
    );

    const formDataObject = {
      name: disbursement_name,
      wallet_id: '',
      asset_id: asset_id,
      registration_contact_type: 'PHONE_NUMBER_AND_WALLET_ADDRESS',
      verification_field: '',
      receiver_registration_message_template: '',
    };

    const formDataString = JSON.stringify(formDataObject);

    const formData = new FormData();
    formData.append('data', formDataString);
    formData.append('file', fileBuffer, {
      filename: 'beneficiaries.csv',
      contentType: 'text/csv',
    });

    const res = await axiosInstance.post(DISBURSEMENT.DISBURSEMENT, formData, {
      headers: {
        ...formData.getHeaders(),
      },
    });

    logger.warn(LOGS.WARN.DISBURSEMENT_SUCCESS);
    return {
      disbursementID: res.data.id,
      assetIssuer: walletRes.data[0].assets[0].issuer,
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
      throw Error(formattedError);
    } else {
      throw Error(error.message);
    }
  }
};

export const updateDisbursementStatus = async (
  disbursementId: string,
  baseUrl: string
) => {
  const { axiosInstance } = getAxiosInstances({
    baseUrl,
  });
  await axiosInstance.patch(DISBURSEMENT.UPDATE(disbursementId), {
    status: 'STARTED',
  });
};

export const getDisbursement = async (
  disbursementId: string,
  baseUrl: string
) => {
  try {
    const { axiosInstance } = getAxiosInstances({
      baseUrl,
    });
    const res = await axiosInstance.get(DISBURSEMENT.GET(disbursementId));
    return res.data;
  } catch (error: any) {
    console.log('Error while getting disbursement', error.message);
    return null;
  }
};

export const uploadDisbursementFile = async (
  disbursementID: string,
  fileBuffer: Buffer,
  fileName: string,
  baseUrl: string
) => {
  const { axiosInstance } = getAxiosInstances({
    baseUrl,
  });
  const formData = new FormData();
  formData.append('file', fileBuffer, fileName);
  await axiosInstance.post(DISBURSEMENT.UPLOAD(disbursementID), formData, {
    headers: {
      ...formData.getHeaders(),
    },
  });
  logger.warn(LOGS.WARN.DISBURSEMENT_SUCCESS);
};
