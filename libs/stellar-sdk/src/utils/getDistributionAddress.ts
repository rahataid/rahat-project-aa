import { getAxiosInstances } from '../lib/axios/axiosInstance';
import { logger } from './logger';
import { LOGS } from '../constants/logger';
import { STELLAR } from '../constants/routes';

interface Organization {
  name: string;
  distribution_account_public_key: string;
  distribution_account: {
    address: string;
    type: string;
    status: string;
  };
}

export const getDistributionAddress = async (
  name: string,
  baseUrl: string
): Promise<string> => {
  logger.info(LOGS.INFO.DISBURSEMENT_ADDRESS(name));

  const { axiosInstance } = getAxiosInstances({
    baseUrl,
  });
  const res = await axiosInstance.get(STELLAR.ORGANIZATION);

  const organization: Organization = res.data;

  if (!organization || organization.name !== name) {
    logger.warn(LOGS.ERROR.DISBURSEMENT_ADDDRESS_NOT_FOUND(name));
    throw new Error(LOGS.ERROR.DISBURSEMENT_ADDDRESS_NOT_FOUND(name));
  }

  return organization.distribution_account_public_key;
};
