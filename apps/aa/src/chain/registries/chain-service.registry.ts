import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import {
  IChainService,
  ChainType,
} from '../interfaces/chain-service.interface';
// TODO: STELLAR DETACH - re-enable once stellar module is rewritten and a Stellar
// chain service implementation is available again.
// import { StellarChainService } from '../chain-services/stellar-chain.service';
import { EvmChainService } from '../chain-services/evm-chain.service';

@Injectable()
export class ChainServiceRegistry {
  private readonly logger = new Logger(ChainServiceRegistry.name);
  private chainServices = new Map<ChainType, IChainService>();

  constructor(
    private settingsService: SettingsService,
    // private stellarChainService: StellarChainService,
    private evmChainService: EvmChainService
  ) {
    this.registerServices();
  }

  private registerServices(): void {
    // TODO: STELLAR DETACH - re-register once a Stellar chain service
    // implementation is available again.
    // this.chainServices.set('stellar', this.stellarChainService);
    this.chainServices.set('evm', this.evmChainService);

    this.logger.log('Registered chain services: evm');
  }

  async getChainService(chainType?: ChainType): Promise<IChainService> {
    const detectedChain = chainType || (await this.detectChainFromSettings());

    const service = this.chainServices.get(detectedChain);
    if (!service) {
      throw new Error(`Chain service not found for type: ${detectedChain}`);
    }

    return service;
  }

  async detectChainFromSettings(): Promise<ChainType> {
    try {
      const chainSettings = await this.settingsService.getPublic(
        'CHAIN_SETTINGS'
      );

      if (
        !chainSettings?.value ||
        typeof chainSettings.value !== 'object' ||
        !('type' in chainSettings.value)
      ) {
        // TODO: STELLAR DETACH - defaulted to 'stellar' previously. Stellar chain
        // service is no longer registered, so default to 'evm' until the stellar
        // module is rewritten and re-registered.
        this.logger.warn('Chain settings not found, defaulting to evm');
        return 'evm';
      }

      const chainType = (
        chainSettings.value as any
      ).type.toLowerCase() as ChainType;

      if (!this.isValidChainType(chainType)) {
        // TODO: STELLAR DETACH - defaulted to 'stellar' previously. Defaulting to
        // 'evm' since stellar chain service is no longer registered.
        this.logger.warn(
          `Invalid chain type: ${chainType}, defaulting to evm`
        );
        return 'evm';
      }

      this.logger.log(`Detected chain type: ${chainType}`);
      return chainType;
    } catch (error) {
      this.logger.error('Error detecting chain from settings:', error);
      // TODO: STELLAR DETACH - defaulted to 'stellar' previously. Defaulting to
      // 'evm' since stellar chain service is no longer registered. Note: if
      // CHAIN_SETTINGS.type === 'stellar' is explicitly configured,
      // getChainService will still throw - accepted broken-feature case until
      // the stellar module is rewritten.
      return 'evm'; // Default fallback
    }
  }

  private isValidChainType(chainType: string): chainType is ChainType {
    return ['stellar', 'evm'].includes(chainType);
  }

  getSupportedChains(): ChainType[] {
    return Array.from(this.chainServices.keys());
  }

  async validateChainConfiguration(chainType?: ChainType): Promise<boolean> {
    try {
      const chain = chainType || (await this.detectChainFromSettings());
      return this.chainServices.has(chain);
    } catch (error) {
      this.logger.error('Error validating chain configuration:', error);
      return false;
    }
  }

  async getChainServiceByAddress(address: string): Promise<IChainService> {
    // Try to detect chain type by address format
    if (address.length === 56 && address.startsWith('G')) {
      // Stellar address format
      return this.getChainService('stellar');
    } else if (address.startsWith('0x') && address.length === 42) {
      // Ethereum address format
      return this.getChainService('evm');
    } else {
      // Fallback to settings detection
      return this.getChainService();
    }
  }
}
