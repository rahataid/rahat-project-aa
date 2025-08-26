import { SendAssetDto } from '../../stellar/dto/send-otp.dto';

export interface IChainService {
  // Token operations
  assignTokens(data: AssignTokensDto): Promise<any>;
  transferTokens(data: TransferTokensDto): Promise<any>;

  // Disbursement operations
  disburse(data: DisburseDto): Promise<any>;
  getDisbursementStatus(id: string): Promise<any>;

  // Send otp operations
  sendOtp(data: SendOtpDto): Promise<any>;
  sendAssetToVendor(data: SendAssetDto): Promise<any>;

  // Account operations
  fundAccount(data: FundAccountDto): Promise<any>;
  checkBalance(address: string): Promise<any>;

  // Authentication operations
  sendOtp(data: SendOtpDto): Promise<any>;
  verifyOtp(data: VerifyOtpDto): Promise<any>;

  // Trigger operations (optional for chains that support it)
  addTrigger?(data: AddTriggerDto): Promise<any>;
  updateTrigger?(data: UpdateTriggerDto): Promise<any>;

  // Utility methods
  validateAddress(address: string): boolean;
  getChainType(): ChainType;

  // Stats
  getDisbursementStats?(): Promise<any>;
}

export type ChainType = 'stellar' | 'evm';

export interface AssignTokensDto {
  beneficiaryAddress: string;
  amount: number;
  tokenType?: string;
  metadata?: any;
}

export class DisburseDto {
  dName: string;
  groups?: string[];
}

export interface FundAccountDto {
  walletAddress: string;
  amount?: number;
  secretKey?: string;
}

export interface SendOtpDto {
  phoneNumber: string;
  amount: number;
  vendorUuid: string;
}

export interface TransferTokensDto {
  fromAddress: string;
  toAddress: string;
  amount: number;
  tokenType?: string;
}

export interface VerifyOtpDto {
  phoneNumber: string;
  otp: string;
  transactionData: any;
}

export interface AddTriggerDto {
  id: string;
  trigger_type: string;
  phase: string;
  title: string;
  source: string;
  params: any;
}

export interface UpdateTriggerDto {
  id: string;
  params?: any;
  source?: string;
  isTriggered?: boolean;
}
