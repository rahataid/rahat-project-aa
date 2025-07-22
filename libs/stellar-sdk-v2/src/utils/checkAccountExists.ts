import { Horizon } from '@stellar/stellar-sdk';

export const checkAccountExists = async (
  wallet: string,
  horizonServer: string
): Promise<boolean> => {
  try {
    console.log(
      `[checkAccountExists] Checking account: ${wallet} on Horizon: ${horizonServer}`
    );
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
