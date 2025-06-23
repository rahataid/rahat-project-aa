import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { SettingsService } from '@rumsan/settings';
import { BQUEUE, JOBS } from '../../constants';
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
} from '../interfaces/chain-service.interface';
import { ethers } from 'ethers';

@Injectable()
export class EvmChainService implements IChainService {
  private readonly logger = new Logger(EvmChainService.name);

  constructor(
    @InjectQueue(BQUEUE.CONTRACT) private contractQueue: Queue,
    private settingsService: SettingsService
  ) {}

  getChainType(): ChainType {
    return 'evm';
  }

  validateAddress(address: string): boolean {
    return ethers.isAddress(address);
  }

  async assignTokens(data: AssignTokensDto): Promise<any> {
    // Transform common DTO to EVM contract format
    const evmData = {
      size: 1,
      start: 0,
      end: 1,
      beneficiaryAddress: data.beneficiaryAddress,
      amount: data.amount,
      ...data.metadata,
    };

    return this.contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, evmData);
  }

  async transferTokens(data: TransferTokensDto): Promise<any> {
    // For EVM, direct token transfers are typically handled through token assignment
    const assignData = {
      beneficiaryAddress: data.toAddress,
      amount: data.amount,
      tokenType: data.tokenType,
    };

    return this.assignTokens(assignData);
  }

  async disburse(data: DisburseDto): Promise<any> {
    return 'ok';
    // Transform common DTO for batch operations
    // const evmDisburseData = {
    //   beneficiaries: data.beneficiaries,
    //   amounts: data.amounts,
    //   groupId: data.groupId,
    //   size: data.beneficiaries.length,
    //   start: 0,
    //   end: data.beneficiaries.length,
    //   ...data.metadata,
    // };

    // return this.contractQueue.add(JOBS.PAYOUT.ASSIGN_TOKEN, evmDisburseData);
  }

  async getDisbursementStatus(id: string): Promise<any> {
    // EVM doesn't have built-in disbursement status tracking like Stellar
    // This would need to be implemented based on transaction hash or contract events
    this.logger.warn('Disbursement status tracking not implemented for EVM');
    return { status: 'NOT_IMPLEMENTED', id };
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    // EVM funding would typically be done through contract budget increase
    const fundingData = {
      walletAddress: data.walletAddress,
      amount: data.amount,
    };

    return this.contractQueue.add(JOBS.CONTRACT.INCREASE_BUDGET, fundingData);
  }

  async checkBalance(address: string): Promise<any> {
    // Balance checking for EVM would need to be implemented separately
    this.logger.warn('Balance checking not implemented for EVM chains');
    return { address, balance: 'NOT_IMPLEMENTED' };
  }

  async sendOtp(data: SendOtpDto): Promise<any> {
    // EVM chains typically don't have built-in OTP mechanisms
    // This would be handled by external services
    this.logger.warn('OTP functionality not available for EVM chains');
    throw new Error('OTP functionality not implemented for EVM chains');
  }

  async sendAssetToVendor(data: any): Promise<any> {
    this.logger.warn('OTP functionality not available for EVM chains');
    throw new Error('OTP functionality not implemented for EVM chains');
  }

  async verifyOtp(data: VerifyOtpDto): Promise<any> {
    // EVM chains typically don't have built-in OTP mechanisms
    this.logger.warn('OTP verification not available for EVM chains');
    throw new Error('OTP verification not implemented for EVM chains');
  }

  // EVM chains don't support triggers in the same way as Stellar
  async addTrigger?(data: AddTriggerDto): Promise<any> {
    this.logger.warn('Trigger functionality not available for EVM chains');
    throw new Error('Trigger functionality not implemented for EVM chains');
  }

  async updateTrigger?(data: UpdateTriggerDto): Promise<any> {
    this.logger.warn(
      'Trigger update functionality not available for EVM chains'
    );
    throw new Error(
      'Trigger update functionality not implemented for EVM chains'
    );
  }
}
