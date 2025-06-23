import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '@rumsan/settings';
import {
  IChainService,
  ChainType,
} from '../interfaces/chain-service.interface';
import { StellarChainService } from '../chain-services/stellar-chain.service';
import { EVMChainService } from '../chain-services/evm-chain.service';

@Injectable()
export class ChainServiceRegistry {
  private readonly logger = new Logger(ChainServiceRegistry.name);
  private chainServices = new Map<ChainType, IChainService>();

  constructor(
    private settingsService: SettingsService,
    private stellarChainService: StellarChainService,
    private evmChainService: EVMChainService
  ) {
    this.registerServices();
  }

  private registerServices(): void {
    this.chainServices.set('stellar', this.stellarChainService);
    this.chainServices.set('evm', this.evmChainService);

    this.logger.log('Registered chain services: stellar, evm');
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
      // Try CHAIN_SETTINGS first, then fall back to CHAIN_CONFIG
      let chainSettings = await this.settingsService.getPublic(
        'CHAIN_SETTINGS'
      );

      if (!chainSettings?.value) {
        // Fallback to CHAIN_CONFIG for EVM
        chainSettings = await this.settingsService.getPublic('CHAIN_CONFIG');

        if (chainSettings?.value && 'rpcUrl' in chainSettings.value) {
          // If CHAIN_CONFIG exists with rpcUrl, assume EVM
          this.logger.log('Detected EVM chain from CHAIN_CONFIG');
          return 'evm';
        }
      }

      if (
        !chainSettings?.value ||
        typeof chainSettings.value !== 'object' ||
        Array.isArray(chainSettings.value)
      ) {
        this.logger.warn('Chain settings not found, defaulting to stellar');
        return 'stellar';
      }

      // Check for explicit type field
      if ('type' in chainSettings.value) {
        const chainType = (
          chainSettings.value as any
        ).type.toLowerCase() as ChainType;

        if (this.isValidChainType(chainType)) {
          this.logger.log(`Detected chain type: ${chainType}`);
          return chainType;
        }
      }

      // Auto-detect based on configuration structure
      if (
        'rpcUrl' in chainSettings.value ||
        'projectContractAddress' in chainSettings.value
      ) {
        this.logger.log('Auto-detected EVM chain from config structure');
        return 'evm';
      }

      if (
        'NETWORK' in chainSettings.value ||
        'ASSETCODE' in chainSettings.value
      ) {
        this.logger.log('Auto-detected Stellar chain from config structure');
        return 'stellar';
      }

      this.logger.warn('Unable to detect chain type, defaulting to stellar');
      return 'stellar';
    } catch (error) {
      this.logger.error('Error detecting chain from settings:', error);
      return 'stellar'; // Default fallback
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
