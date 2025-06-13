import { Horizon } from '@stellar/stellar-sdk';
import { ASSET, horizonServer } from '../constants/constant';

export const getBalance = async (pk: string) => {
  const server = new Horizon.Server(horizonServer);

  const account = await server.loadAccount(pk);

  const balances = account.balances
    .filter((balance: any) => {
      return (
        (balance.asset_code === ASSET.NAME &&
          balance.asset_issuer === ASSET.ISSUER) ||
        balance.asset_type === 'native'
      );
    })
    .map((balance: any) => {
      return {
        asset: balance.asset_code || balance.asset_type,
        balance: balance.balance,
      };
    });

  return balances;
};
