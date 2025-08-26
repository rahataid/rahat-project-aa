import { ethers } from "ethers";
import {
  SDKConfig,
  TokenBalance,
  TokenAllowance,
  TransactionResult,
  GasEstimate,
} from "../types";
import { SDKError } from "../core/SDKError";
import { ValidationUtils } from "../utils/ValidationUtils";

/**
 * Operations Manager for handling token operations
 * Based on patterns from 1.run-account.ts
 */
export class OperationsManager {
  private provider: ethers.Provider | null = null;
  private cashTokenContract: ethers.Contract | null = null;
  private config: SDKConfig | null = null;
  private sdk: any = null; // Reference to the main SDK for entity access

  /**
   * Initialize the operations manager
   */
  async initialize(
    provider: ethers.Provider,
    cashTokenContract: ethers.Contract,
    config: SDKConfig,
    sdk?: any
  ): Promise<void> {
    this.provider = provider;
    this.cashTokenContract = cashTokenContract;
    this.config = config;
    if (sdk) {
      this.sdk = sdk;
    }
  }

  /**
   * Set SDK reference for entity access
   */
  setSdkReference(sdk: any): void {
    this.sdk = sdk;
  }

  /**
   * Get token balance for an entity
   * Based on the balance checking pattern from 1.run-account.ts
   */
  async getBalance(entityId: string): Promise<TokenBalance> {
    if (!this.cashTokenContract) {
      throw SDKError.configError("Operations manager not initialized");
    }

    // Get entity from entity manager (this would be injected)
    const entity = this.getEntityFromId(entityId);
    if (!entity) {
      throw SDKError.entityNotFound(entityId);
    }

    try {
      const balance = await this.cashTokenContract.balanceOf(entity.address);
      const decimals = await this.cashTokenContract.decimals();
      const symbol = await this.cashTokenContract.symbol();

      return {
        entityId,
        balance,
        formatted: ethers.formatUnits(balance, decimals),
        decimals,
        symbol,
      };
    } catch (error) {
      throw SDKError.networkError(
        `Failed to get balance for entity ${entityId}`,
        { error }
      );
    }
  }

  /**
   * Approve tokens for spending
   * Based on the approval pattern from 1.run-account.ts
   */
  async approveTokens(
    ownerId: string,
    spenderId: string,
    amount: bigint
  ): Promise<TransactionResult> {
    if (!this.cashTokenContract) {
      throw SDKError.configError("Operations manager not initialized");
    }

    const owner = this.getEntityFromId(ownerId);
    const spender = this.getEntityFromId(spenderId);

    if (!owner) {
      throw SDKError.entityNotFound(ownerId);
    }
    if (!spender) {
      throw SDKError.entityNotFound(spenderId);
    }

    try {
      console.log(`Approving tokens for: ${spender.smartAccount}`);

      // Encode approval data
      const approveData = this.cashTokenContract.interface.encodeFunctionData(
        "approve",
        [spender.smartAccount, amount]
      );

      // Execute through smart account
      const approveTx = await owner.smartAccountContract!.execute(
        this.cashTokenContract.target,
        0,
        approveData
      );

      const receipt = await approveTx.wait();

      return {
        hash: approveTx.hash,
        status: "confirmed",
        receipt,
        gasUsed: receipt?.gasUsed,
        gasPrice: receipt?.gasPrice,
      };
    } catch (error) {
      throw SDKError.transactionFailed(
        `Failed to approve tokens from ${ownerId} to ${spenderId}`,
        { error }
      );
    }
  }

  /**
   * Get allowance between entities
   * Based on the allowance checking pattern from 1.run-account.ts
   */
  async getAllowance(
    ownerId: string,
    spenderId: string
  ): Promise<TokenAllowance> {
    if (!this.cashTokenContract) {
      throw SDKError.configError("Operations manager not initialized");
    }

    const owner = this.getEntityFromId(ownerId);
    const spender = this.getEntityFromId(spenderId);

    if (!owner) {
      throw SDKError.entityNotFound(ownerId);
    }
    if (!spender) {
      throw SDKError.entityNotFound(spenderId);
    }

    try {
      const allowance = await this.cashTokenContract.allowance(
        owner.address,
        spender.address
      );
      const decimals = await this.cashTokenContract.decimals();

      return {
        ownerId,
        spenderId,
        allowance,
        formatted: ethers.formatUnits(allowance, decimals),
      };
    } catch (error) {
      throw SDKError.networkError(
        `Failed to get allowance from ${ownerId} to ${spenderId}`,
        { error }
      );
    }
  }

  /**
   * Transfer tokens using transferFrom
   * Based on the transferFrom pattern from 1.run-account.ts
   */
  async transferFrom(
    spenderId: string,
    fromId: string,
    toId: string,
    amount: bigint
  ): Promise<TransactionResult> {
    if (!this.cashTokenContract) {
      throw SDKError.configError("Operations manager not initialized");
    }

    const spender = this.getEntityFromId(spenderId);
    const from = this.getEntityFromId(fromId);
    const to = this.getEntityFromId(toId);

    if (!spender) {
      throw SDKError.entityNotFound(spenderId);
    }
    if (!from) {
      throw SDKError.entityNotFound(fromId);
    }
    if (!to) {
      throw SDKError.entityNotFound(toId);
    }

    try {
      console.log("\nTransferring tokens using transferFrom...");

      // Encode transferFrom data
      const transferFromData =
        this.cashTokenContract.interface.encodeFunctionData("transferFrom", [
          from.smartAccount,
          to.smartAccount,
          amount,
        ]);

      // Execute through smart account
      const transferFromTx = await spender.smartAccountContract!.execute(
        this.cashTokenContract.target,
        0,
        transferFromData
      );

      const receipt = await transferFromTx.wait();

      // Print final balances
      console.log("\nFinal balances:");
      await this.printBalance(from.smartAccount, "From Account");
      await this.printBalance(to.smartAccount, "To Account");

      return {
        hash: transferFromTx.hash,
        status: "confirmed",
        receipt,
        gasUsed: receipt?.gasUsed,
        gasPrice: receipt?.gasPrice,
      };
    } catch (error) {
      throw SDKError.transactionFailed(
        `Failed to transfer tokens from ${fromId} to ${toId} via ${spenderId}`,
        { error }
      );
    }
  }

  /**
   * Estimate gas for an operation
   */
  async estimateGas(operation: string, params: any): Promise<GasEstimate> {
    if (!this.provider || !this.cashTokenContract) {
      throw SDKError.configError("Operations manager not initialized");
    }

    try {
      let gasLimit: bigint;
      let gasPrice: bigint;

      switch (operation) {
        case "approve":
          const approveData =
            this.cashTokenContract.interface.encodeFunctionData("approve", [
              params.spender,
              params.amount,
            ]);
          gasLimit = await this.provider.estimateGas({
            to: this.cashTokenContract.target,
            data: approveData,
          });
          break;

        case "transferFrom":
          const transferFromData =
            this.cashTokenContract.interface.encodeFunctionData(
              "transferFrom",
              [params.from, params.to, params.amount]
            );
          gasLimit = await this.provider.estimateGas({
            to: this.cashTokenContract.target,
            data: transferFromData,
          });
          break;

        default:
          throw SDKError.validationError(`Unknown operation: ${operation}`);
      }

      gasPrice = await this.provider
        .getFeeData()
        .then((feeData) => feeData.gasPrice || 0n);
      const totalCost = gasLimit * gasPrice;

      return {
        gasLimit,
        gasPrice,
        totalCost,
      };
    } catch (error) {
      throw SDKError.networkError(`Failed to estimate gas for ${operation}`, {
        error,
      });
    }
  }

  /**
   * Print balance for an address
   * Based on the printBalance function from 1.run-account.ts
   */
  private async printBalance(address: string, label: string): Promise<void> {
    if (!this.cashTokenContract) {
      throw SDKError.configError("Operations manager not initialized");
    }

    try {
      console.log("checking balance for", address);
      const balance = await this.cashTokenContract.balanceOf(address);
      const decimalPlaces = await this.cashTokenContract.decimals();
      console.log(
        `${label} balance:`,
        ethers.formatUnits(balance, decimalPlaces),
        "CASH"
      );
    } catch (error) {
      console.error(`Failed to print balance for ${address}:`, error);
    }
  }

  /**
   * Get entity from ID
   * This references the SDK's EntityManager
   */
  private getEntityFromId(entityId: string): any {
    if (!this.sdk) {
      throw SDKError.configError("SDK reference not set in OperationsManager");
    }
    return this.sdk.entities.getEntity(entityId);
  }
}
