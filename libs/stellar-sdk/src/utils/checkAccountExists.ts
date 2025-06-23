import { Horizon } from '@stellar/stellar-sdk';
import { horizonServer } from '../constants';

export const checkAccountExists = async (wallet: string): Promise<boolean> => {
  try {
    const server = new Horizon.Server(horizonServer);
    await server.accounts().accountId(wallet).call();
    return true;
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return false;
    }
    throw error;
  }
};
