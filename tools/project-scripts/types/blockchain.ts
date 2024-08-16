import { Addressable } from 'ethers';

export type ITokenDeploymentData = {
  communityName: string;
  projectName: string;
  tokenName: string;
  tokenSymbol: string;
  tokenDecimals: number;
  projectManager: string;
};

export type INetworkKeys = {
  privateKey: string;
  publicKey?: string;
  address?: string;
};

export interface DeployedContract {
  address: string | Addressable;
  startBlock: number;
}
