import { SDKError } from '../core/SDKError';
import { ethers } from 'ethers';
import { SDKErrorCode } from '../types';

/**
 * Interface for mint token request parameters
 */
export interface MintTokenRequest {
  tokenAddress: string; // RahatToken contract address
  projectAddress: string; // AAProject contract address
  amount: string; // Amount to mint (as string to handle large numbers)
  cashTokenAddress: string; // Cash token contract address
  cashTokenReceiver: string; // Address to receive cash tokens
  decimals?: number; // Token decimals, defaults to 18
}

/**
 * Interface for contract configuration
 */
export interface ContractConfig {
  address: string;
  abi: any[];
}

/**
 * Interface for EVM provider configuration
 */
export interface EVMProviderConfig {
  rpcUrl: string;
  privateKey: string;
}

/**
 * Result of mint token operation
 */
export interface MintTokenResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  error?: string;
}

/**
 * Utility class for EVM blockchain operations
 * Provides generic functions for common EVM operations like minting tokens
 */
export class EVMUtils {
  private provider: ethers.Provider | null = null;
  private signer: ethers.Wallet | null = null;

  /**
   * Initialize the EVM utilities with provider and signer
   * @param config - EVM provider configuration
   */
  async initialize(config: EVMProviderConfig): Promise<void> {
    try {
      this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    } catch (error) {
      throw SDKError.fromError(error as Error, SDKErrorCode.NETWORK_ERROR);
    }
  }

  /**
   * Convert ABI object keys to lowercase for compatibility
   * @param oldABI - Original ABI object
   * @returns Converted ABI with lowercase keys
   */
  private convertABI(oldABI: any): any {
    const convertKeysToLowerCase = (obj: any): any => {
      if (Array.isArray(obj)) {
        return obj.map(convertKeysToLowerCase);
      }
      if (typeof obj === 'object' && obj !== null) {
        return Object.keys(obj).reduce((acc: any, key) => {
          acc[key.toLowerCase()] = convertKeysToLowerCase(obj[key]);
          return acc;
        }, {});
      }
      return obj;
    };

    try {
      return convertKeysToLowerCase(oldABI);
    } catch (error) {
      throw SDKError.fromError(error as Error, SDKErrorCode.NETWORK_ERROR);
    }
  }

  /**
   * Generic function to mint tokens using RahatDonor contract
   * @param mintRequest - Mint token request parameters
   * @param rahatDonorConfig - RahatDonor contract configuration
   * @returns Promise<MintTokenResult> - Result of the mint operation
   */
  async mintTokens(
    mintRequest: MintTokenRequest,
    rahatDonorConfig: ContractConfig
  ): Promise<MintTokenResult> {
    try {
      if (!this.provider || !this.signer) {
        throw new Error('EVMUtils not initialized. Call initialize() first.');
      }

      const {
        tokenAddress,
        projectAddress,
        amount,
        cashTokenAddress,
        cashTokenReceiver,
        decimals = 18,
      } = mintRequest;

      // Convert ABI to lowercase for compatibility
      const rahatDonorAbi = this.convertABI(rahatDonorConfig.abi);

      // Create contract instance
      const rahatDonorContract = new ethers.Contract(
        rahatDonorConfig.address,
        rahatDonorAbi,
        this.signer
      );

      // Parse the amount with specified decimals
      const mintAmount = ethers.parseUnits(amount, decimals);

      // Execute mint transaction using RahatDonor
      const tx = await rahatDonorContract.mintTokens(
        tokenAddress,
        projectAddress,
        cashTokenAddress,
        cashTokenReceiver,
        mintAmount
      );

      // Wait for transaction confirmation
      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  /**
   * Generic function to execute any contract method
   * @param contractConfig - Contract configuration
   * @param methodName - Name of the method to call
   * @param params - Parameters to pass to the method
   * @returns Promise<any> - Result of the method call
   */
  async executeContractMethod(
    contractConfig: ContractConfig,
    methodName: string,
    params: any[] = []
  ): Promise<any> {
    try {
      if (!this.provider || !this.signer) {
        throw new Error('EVMUtils not initialized. Call initialize() first.');
      }

      const contractAbi = this.convertABI(contractConfig.abi);
      const contract = new ethers.Contract(
        contractConfig.address,
        contractAbi,
        this.signer
      );

      const tx = await contract[methodName](...params);
      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        receipt,
      };
    } catch (error) {
      throw SDKError.fromError(error as Error, SDKErrorCode.TRANSACTION_FAILED);
    }
  }

  /**
   * Get provider instance
   * @returns ethers.Provider or null
   */
  getProvider(): ethers.Provider | null {
    return this.provider;
  }

  /**
   * Get signer instance
   * @returns ethers.Wallet or null
   */
  getSigner(): ethers.Wallet | null {
    return this.signer;
  }

  /**
   * Check if EVMUtils is initialized
   * @returns boolean
   */
  isInitialized(): boolean {
    return this.provider !== null && this.signer !== null;
  }
}
