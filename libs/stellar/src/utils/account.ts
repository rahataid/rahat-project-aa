import { Horizon } from '@stellar/stellar-sdk';

type BalanceLine = Horizon.HorizonApi.BalanceLine;
type BalanceLineAsset = Horizon.HorizonApi.BalanceLineAsset;

function isAssetBalance(balance: BalanceLine): balance is BalanceLineAsset {
  return 'asset_code' in balance && 'asset_issuer' in balance;
}

export async function accountExists(server: Horizon.Server, publicKey: string): Promise<boolean> {
  try {
    await server.loadAccount(publicKey);
    return true;
  } catch (error) {
    if ((error as { response?: { status?: number } })?.response?.status === 404) {
      return false;
    }
    throw error;
  }
}

export async function hasTrustline(
  server: Horizon.Server,
  publicKey: string,
  assetCode: string,
  assetIssuer: string
): Promise<boolean> {
  const account = await server.loadAccount(publicKey);

  return account.balances.some(
    (balance) => isAssetBalance(balance) && balance.asset_code === assetCode && balance.asset_issuer === assetIssuer
  );
}

export async function getBalance(
  server: Horizon.Server,
  publicKey: string,
  assetCode: string,
  assetIssuer: string
): Promise<string> {
  const account = await server.loadAccount(publicKey);

  const balance = account.balances.find(
    (b) => isAssetBalance(b) && b.asset_code === assetCode && b.asset_issuer === assetIssuer
  );

  return balance?.balance ?? '0';
}

export async function getNativeBalance(server: Horizon.Server, publicKey: string): Promise<string> {
  const account = await server.loadAccount(publicKey);

  const balance = account.balances.find((b) => b.asset_type === 'native');

  return balance?.balance ?? '0';
}
