import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { StellarService } from '../../stellar/stellar.service';
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

@Injectable()
export class StellarChainService implements IChainService {
  private readonly logger = new Logger(StellarChainService.name);

  constructor(
    @InjectQueue(BQUEUE.STELLAR) private stellarQueue: Queue,
    private stellarService: StellarService,
    private settingsService: SettingsService
  ) {}

  getChainType(): ChainType {
    return 'stellar';
  }

  validateAddress(address: string): boolean {
    // Stellar addresses are 56 characters long and start with 'G'
    return address.length === 56 && address.startsWith('G');
  }

  async assignTokens(data: AssignTokensDto): Promise<any> {
    // Transform common DTO to stellar-specific format
    const stellarData = {
      walletAddress: data.beneficiaryAddress,
      secretKey: data.metadata?.secretKey,
      amount: data.amount,
    };

    return this.stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, stellarData);
  }

  async transferTokens(data: TransferTokensDto): Promise<any> {
    // For Stellar, token transfers are typically handled through disbursements
    const disbursementData = {
      beneficiaries: [data.toAddress],
      amounts: [data.amount],
      metadata: data,
    };

    return this.disburse(disbursementData);
  }

  async disburse(data: DisburseDto): Promise<any> {
    // Transform common DTO to stellar disburse format
    const stellarDisburseData = {
      beneficiaries: data.beneficiaries,
      amounts: data.amounts,
      groupId: data.groupId,
      ...data.metadata,
    };

    return this.stellarQueue.add(
      JOBS.STELLAR.DISBURSE_ONCHAIN_QUEUE,
      stellarDisburseData
    );
  }

  async getDisbursementStatus(id: string): Promise<any> {
    const statusData = {
      disbursementId: id,
    };

    return this.stellarQueue.add(
      JOBS.STELLAR.DISBURSEMENT_STATUS_UPDATE,
      statusData
    );
  }

  async fundAccount(data: FundAccountDto): Promise<any> {
    const fundingData = {
      walletAddress: data.walletAddress,
      amount: data.amount,
      secretKey: data.secretKey,
    };

    return this.stellarQueue.add(JOBS.STELLAR.FAUCET_TRUSTLINE, fundingData);
  }

  async checkBalance(address: string): Promise<any> {
    const walletData = { address: address, walletAddress: address };
    return this.stellarService.getWalletStats(walletData);
  }

  async sendOtp(data: SendOtpDto): Promise<any> {
    const stellarOtpData = {
      phoneNumber: data.phoneNumber,
      amount: data.amount.toString(),
      vendorAddress: data.vendorAddress,
    };
    return this.stellarService.sendOtp(stellarOtpData);
  }

  async verifyOtp(data: VerifyOtpDto): Promise<any> {
    const verificationData = {
      phoneNumber: data.phoneNumber,
      otp: data.otp,
      amount: data.transactionData.amount?.toString() || '0',
      receiverAddress: data.transactionData.vendorAddress,
    };

    return this.stellarService.sendAssetToVendor(verificationData);
  }

  async addTrigger(data: AddTriggerDto): Promise<any> {
    const triggerData = {
      triggers: [data], // Stellar processor expects array of triggers
    };

    return this.stellarQueue.add(
      JOBS.STELLAR.ADD_ONCHAIN_TRIGGER_QUEUE,
      triggerData
    );
  }

  async updateTrigger(data: UpdateTriggerDto): Promise<any> {
    const updateData = {
      id: data.id,
      params: data.params,
      source: data.source,
      isTriggered: data.isTriggered,
    };

    return this.stellarQueue.add(
      JOBS.STELLAR.UPDATE_ONCHAIN_TRIGGER_PARAMS_QUEUE,
      updateData
    );
  }
}
