import { Injectable, Logger } from '@nestjs/common';
import { ChainServiceRegistry } from './registries/chain-service.registry';
import {
  IChainService,
  ChainType,
  AssignTokensDto,
  DisburseDto,
  FundAccountDto,
  SendOtpDto,
  TransferTokensDto,
  VerifyOtpDto,
  AddTriggerDto,
  UpdateTriggerDto,
} from './interfaces/chain-service.interface';

@Injectable()
export class ChainQueueService {
  private readonly logger = new Logger(ChainQueueService.name);

  constructor(private chainServiceRegistry: ChainServiceRegistry) {}

  async assignTokens(
    data: AssignTokensDto,
    chainType?: ChainType
  ): Promise<any> {
    this.logger.log(`Assigning tokens to ${data.beneficiaryAddress}`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.assignTokens(data);
  }

  async transferTokens(
    data: TransferTokensDto,
    chainType?: ChainType
  ): Promise<any> {
    this.logger.log(
      `Transferring tokens from ${data.fromAddress} to ${data.toAddress}`
    );
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.transferTokens(data);
  }

  async disburse(data: DisburseDto, chainType?: ChainType): Promise<any> {
    this.logger.log(`Disbursing to ${data.beneficiaries.length} beneficiaries`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.disburse(data);
  }

  async getDisbursementStatus(id: string, chainType?: ChainType): Promise<any> {
    this.logger.log(`Getting disbursement status for ${id}`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.getDisbursementStatus(id);
  }

  async fundAccount(data: FundAccountDto, chainType?: ChainType): Promise<any> {
    this.logger.log(`Funding account ${data.walletAddress}`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.fundAccount(data);
  }

  async checkBalance(address: string, chainType?: ChainType): Promise<any> {
    this.logger.log(`Checking balance for ${address}`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.checkBalance(address);
  }

  async checkBalanceByAddress(address: string): Promise<any> {
    this.logger.log(`Auto-detecting chain and checking balance for ${address}`);
    const chainService =
      await this.chainServiceRegistry.getChainServiceByAddress(address);
    return chainService.checkBalance(address);
  }

  async sendOtp(data: SendOtpDto, chainType?: ChainType): Promise<any> {
    this.logger.log(`Sending OTP to ${data.phoneNumber}`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.sendOtp(data);
  }

  async verifyOtp(data: VerifyOtpDto, chainType?: ChainType): Promise<any> {
    this.logger.log(`Verifying OTP for ${data.phoneNumber}`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.verifyOtp(data);
  }

  async addTrigger(data: AddTriggerDto, chainType?: ChainType): Promise<any> {
    this.logger.log(`Adding trigger ${data.id}`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );

    if (!chainService.addTrigger) {
      throw new Error(
        `Trigger functionality not supported for ${chainService.getChainType()} chain`
      );
    }

    return chainService.addTrigger(data);
  }

  async updateTrigger(
    data: UpdateTriggerDto,
    chainType?: ChainType
  ): Promise<any> {
    this.logger.log(`Updating trigger ${data.id}`);
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );

    if (!chainService.updateTrigger) {
      throw new Error(
        `Trigger update functionality not supported for ${chainService.getChainType()} chain`
      );
    }

    return chainService.updateTrigger(data);
  }

  async validateAddress(
    address: string,
    chainType?: ChainType
  ): Promise<boolean> {
    const chainService = await this.chainServiceRegistry.getChainService(
      chainType
    );
    return chainService.validateAddress(address);
  }

  async getCurrentChainType(): Promise<ChainType> {
    const chainService = await this.chainServiceRegistry.getChainService();
    return chainService.getChainType();
  }

  async getSupportedChains(): Promise<ChainType[]> {
    return this.chainServiceRegistry.getSupportedChains();
  }

  async validateChainConfiguration(chainType?: ChainType): Promise<boolean> {
    return this.chainServiceRegistry.validateChainConfiguration(chainType);
  }

  // Convenience methods for common operations
  async assignTokensToBeneficiary(
    beneficiaryAddress: string,
    amount: number,
    metadata?: any
  ): Promise<any> {
    const data: AssignTokensDto = {
      beneficiaryAddress,
      amount,
      metadata,
    };
    return this.assignTokens(data);
  }

  async bulkAssignTokens(
    assignments: Array<{ address: string; amount: number }>,
    chainType?: ChainType
  ): Promise<any> {
    const addresses = assignments.map((a) => a.address);
    const amounts = assignments.map((a) => a.amount);

    const data: DisburseDto = {
      beneficiaries: addresses,
      amounts,
    };

    return this.disburse(data, chainType);
  }

  async transferTokensBetweenAddresses(
    fromAddress: string,
    toAddress: string,
    amount: number,
    chainType?: ChainType
  ): Promise<any> {
    const data: TransferTokensDto = {
      fromAddress,
      toAddress,
      amount,
    };
    return this.transferTokens(data, chainType);
  }
}
