import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import { Asset, StellarClient, StellarClientConfig, StellarNetwork } from '@rahataid/stellar';
import { ethers } from 'ethers';
import { AppService } from '../app/app.service';

type ChainType = 'stellar' | 'evm';

const ERC20_ABI = [
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function transfer(address to, uint256 amount) returns (bool)',
];

@Injectable()
export class GctTreasuryService implements OnModuleInit {
  private readonly logger = new Logger(GctTreasuryService.name);
  private misconfigured = false;

  constructor(private readonly appService: AppService) {}

  async onModuleInit() {
    try {
      const chainType = await this.getActiveChainType();
      const treasury = await this.getTreasurySettings();
      const keyChain = this.classifyAddressChain(treasury.gctPublicKey);

      if (keyChain !== 'unknown' && keyChain !== chainType) {
        this.logger.warn(
          `GCT_TREASURY.GCT_PUBLIC_KEY looks like a ${keyChain} address but the active CHAIN_SETTINGS type is "${chainType}". GCT disbursement will be blocked until this is fixed.`
        );
        this.misconfigured = true;
      }
    } catch (error: any) {
      this.logger.warn(`Could not validate GCT_TREASURY on startup: ${error.message}`);
    }
  }

  async getTreasuryInfo() {
    this.assertConfigured();
    const chainType = await this.getActiveChainType();
    const treasury = await this.getTreasurySettings();
    const balance = await this.getBalance();

    const asset =
      chainType === 'stellar'
        ? this.parseStellarAsset(treasury.gctToken)
        : { tokenAddress: treasury.gctToken };

    return {
      publicKey: treasury.gctPublicKey,
      balance,
      chainType,
      asset,
    };
  }

  async getBalance(): Promise<number> {
    this.assertConfigured();
    const chainType = await this.getActiveChainType();
    const treasury = await this.getTreasurySettings();

    if (chainType === 'stellar') {
      const client = await this.buildStellarClient(treasury);
      const balance = await client.getBalance(treasury.gctPublicKey);
      return Number(balance);
    }

    const { contract, decimals } = await this.buildEvmContract(treasury);
    const rawBalance = await contract.balanceOf(treasury.gctPublicKey);
    return Number(ethers.formatUnits(rawBalance, decimals));
  }


  //TODO: Update for multi-chain support, currently only supports Stellar and EVM chains
  async transfer(toAddress: string, amount: number): Promise<string> {
    this.assertConfigured();
    const chainType = await this.getActiveChainType();
    const treasury = await this.getTreasurySettings();

    if (chainType === 'stellar') {
      const client = await this.buildStellarClient(treasury);
      const { assetCode, assetIssuer } = this.parseStellarAsset(treasury.gctToken);
      const result = await client.sendPayment(
        treasury.gctSecretKey,
        toAddress,
        new Asset(assetCode, assetIssuer),
        amount.toString()
      );
      return result.hash;
    }

    const { contract, decimals } = await this.buildEvmContract(treasury, true);
    const tx = await contract.transfer(toAddress, ethers.parseUnits(amount.toString(), decimals));
    const receipt = await tx.wait();
    return receipt?.hash;
  }

  private assertConfigured() {
    if (this.misconfigured) {
      throw new RpcException(
        'GCT treasury is misconfigured: GCT_PUBLIC_KEY does not match the active chain. Fix CHAIN_SETTINGS/GCT_TREASURY before disbursing.'
      );
    }
  }

  private async getActiveChainType(): Promise<ChainType> {
    const chainSettings = await this.appService.getSettings({ name: 'CHAIN_SETTINGS' });
    const type = (chainSettings?.value as any)?.type;
    return typeof type === 'string' && type.toLowerCase() === 'stellar' ? 'stellar' : 'evm';
  }

  private async getChainRpcUrl(): Promise<string> {
    const chainSettings = await this.appService.getSettings({ name: 'CHAIN_SETTINGS' });
    const rpcUrl = (chainSettings?.value as any)?.rpcurl;
    if (!rpcUrl) {
      throw new RpcException('CHAIN_SETTINGS.rpcUrl not found');
    }
    return rpcUrl;
  }

  private async getTreasurySettings(): Promise<{
    gctToken: string;
    gctSecretKey: string;
    gctPublicKey: string;
  }> {
    const setting = await this.appService.getSettings({ name: 'GCT_TREASURY' });
    const value = setting?.value as any;
    const gctToken = value?.gct_token;
    const gctSecretKey = value?.gct_secret_key;
    const gctPublicKey = value?.gct_public_key;

    if (!gctToken || !gctSecretKey || !gctPublicKey) {
      throw new RpcException('GCT_TREASURY setting is missing GCT_TOKEN/GCT_SECRET_KEY/GCT_PUBLIC_KEY');
    }

    return { gctToken, gctSecretKey, gctPublicKey };
  }

  private classifyAddressChain(address: string): ChainType | 'unknown' {
    if (address.length === 56 && address.startsWith('G')) return 'stellar';
    if (address.startsWith('0x') && address.length === 42) return 'evm';
    return 'unknown';
  }

  private parseStellarAsset(gctToken: string): { assetCode: string; assetIssuer: string } {
    const [assetCode, assetIssuer] = gctToken.split(':');
    if (!assetCode || !assetIssuer) {
      throw new RpcException('GCT_TOKEN must be in "<asset_code>:<asset_issuer>" format for stellar');
    }
    return { assetCode, assetIssuer };
  }

  private async buildStellarClient(treasury: { gctToken: string; gctSecretKey: string }): Promise<StellarClient> {
    const { assetCode, assetIssuer } = this.parseStellarAsset(treasury.gctToken);
    const chainSettings = await this.appService.getSettings({ name: 'CHAIN_SETTINGS' });
    const chainId: string = (chainSettings?.value as any)?.chainid || '';
    const rpcUrl = await this.getChainRpcUrl();
    const network: StellarNetwork = chainId.toLowerCase().includes('test') ? 'testnet' : 'mainnet';

    const config: StellarClientConfig = {
      network,
      horizonUrl: rpcUrl,
      assetCode,
      assetIssuer,
      sponsorSecret: treasury.gctSecretKey,
    };

    return new StellarClient(config);
  }

  private async buildEvmContract(
    treasury: { gctToken: string; gctSecretKey: string },
    withSigner = false
  ): Promise<{ contract: ethers.Contract; decimals: number }> {
    const rpcUrl = await this.getChainRpcUrl();
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const runner = withSigner ? new ethers.Wallet(treasury.gctSecretKey, provider) : provider;
    const contract = new ethers.Contract(treasury.gctToken, ERC20_ABI, runner);
    const decimals = await contract.decimals();
    return { contract, decimals };
  }
}
