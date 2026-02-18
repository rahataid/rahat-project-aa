export type Config = {
  blockchain: {
    chainId: number | string;
    chainName: string;
    nativeCurrency?: {
      name?: string;
      symbol?: string;
      decimals?: 18;
    };
    rpcUrl: string;
    blockExplorerUrls?: string[];
    iconUrls?: string[];
    chainWebSocket?: string;
    networkId?: number;
  };
  chainCacher: {
    url: string;
    appUuid: string;
  };
};
