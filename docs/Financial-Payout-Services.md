# Financial Payout Services

This document provides detailed information about the financial payout services integrated into the Rahat Anticipatory Action platform, including offramp services, payment providers, and token-to-fiat conversion workflows.

## Overview

The financial payout system enables the conversion of blockchain tokens to local currency and distribution to beneficiaries through various payment methods. The system supports multiple payment providers and offramp services for seamless cash distribution.

## Architecture

### Core Components

#### 1. Offramp Services
- **Purpose**: Token-to-fiat conversion and local payment processing
- **Integration**: REST API with authentication
- **Features**: Instant conversion, bank transfers, VPA payments

#### 2. Payment Providers
- **Purpose**: Local financial service provider integration
- **Features**: Multiple provider support, transaction tracking
- **Methods**: Bank transfers, mobile money, VPA

#### 3. Payout Management
- **Purpose**: Orchestrate the entire payout process
- **Features**: Batch processing, status tracking, error handling

## Payout Flow

### 1. Payout Initiation

#### Payout Service Structure
```typescript
// apps/aa/src/payouts/payouts.service.ts
@Injectable()
export class PayoutsService {
  constructor(
    private readonly offrampService: OfframpService,
    private readonly stellarService: StellarService,
    private readonly prisma: PrismaService
  ) {}

  async triggerPayout(uuid: string): Promise<any> {
    const payoutDetails = await this.findOne(uuid);
    
    if (payoutDetails.isPayoutTriggered) {
      throw new RpcException(
        `Payout with UUID '${uuid}' has already been triggered`
      );
    }

    const BeneficiaryPayoutDetails = await this.fetchBeneficiaryPayoutDetails(uuid);
    const offrampWalletAddress = await this.offrampService.getOfframpWalletAddress();

    const stellerOfframpQueuePayload: FSPPayoutDetails[] = 
      BeneficiaryPayoutDetails.map((beneficiary) => ({
        amount: beneficiary.amount,
        beneficiaryWalletAddress: beneficiary.walletAddress,
        beneficiaryBankDetails: beneficiary.bankDetails,
        payoutUUID: uuid,
        payoutProcessorId: payoutDetails.payoutProcessorId,
        beneficiaryPhoneNumber: beneficiary.phoneNumber,
        offrampWalletAddress,
        offrampType: payoutExtras.paymentProviderType,
      }));

    await this.stellarService.addBulkToTokenTransferQueue(
      stellerOfframpQueuePayload
    );

    return 'Payout Initiated Successfully';
  }
}
```

#### Beneficiary Payout Details
```typescript
interface BeneficiaryPayoutDetails {
  amount: number;
  walletAddress: string;
  bankDetails: {
    bankName: string;
    accountNumber: string;
    accountName: string;
    ifscCode?: string;
  };
  phoneNumber: string;
  beneficiaryId: string;
}
```

### 2. Token Transfer Process

#### Stellar Token Transfer
```typescript
// apps/aa/src/processors/stellar.processor.ts
@Processor(BQUEUE.STELLAR)
export class StellarProcessor {
  @Process(JOBS.STELLAR.TRANSFER_TO_OFFRAMP)
  async processTransferToOfframp(job: Job) {
    const payload: FSPPayoutDetails = job.data;
    
    try {
      // Transfer tokens from beneficiary to offramp wallet
      const transactionResult = await this.stellarService.transferTokens({
        fromAddress: payload.beneficiaryWalletAddress,
        toAddress: payload.offrampWalletAddress,
        amount: payload.amount,
        assetCode: 'RAHAT',
        assetIssuer: process.env.STELLAR_ASSET_ISSUER
      });

      // Add to offramp queue for cash conversion
      await this.offrampService.addBulkToOfframpQueue([payload]);

      return transactionResult;
    } catch (error) {
      this.logger.error(`Token transfer failed: ${error.message}`);
      throw error;
    }
  }
}
```

### 3. Offramp Processing

#### Offramp Service Integration
```typescript
// apps/aa/src/payouts/offramp.service.ts
@Injectable()
export class OfframpService {
  async fetchOfframpSettings(): Promise<{
    url: string;
    appId: string;
    accessToken: string;
  }> {
    // Fetch settings from core service
    const settings = await this.coreClient.send({
      cmd: 'SETTINGS.GET',
      data: { name: 'OFFRAMP_SETTINGS' }
    });

    return {
      url: settings.value.URL,
      appId: settings.value.APP_ID,
      accessToken: settings.value.ACCESS_TOKEN
    };
  }

  async getOfframpWalletAddress(): Promise<string> {
    const offrampSettings = await this.fetchOfframpSettings();
    
    const response = await this.httpService.axiosRef.get(
      `${offrampSettings.url}/app/${offrampSettings.appId}`,
      {
        headers: { 'APP_ID': offrampSettings.appId }
      }
    );

    return response.data.data.wallet;
  }

  async instantOfframp(offrampPayload: any): Promise<CipsResponseData> {
    const offrampSettings = await this.fetchOfframpSettings();
    
    const response = await this.httpService.axiosRef.post(
      `${offrampSettings.url}/offramp-request/instant`,
      offrampPayload,
      {
        headers: { 'APP_ID': offrampSettings.appId }
      }
    );

    return response.data.data;
  }
}
```

#### Offramp Payload Generation
```typescript
// apps/aa/src/processors/offramp.processor.ts
private async generateOfframpPayload(
  offrampType: string,
  fspOfframpDetails: FSPOfframpDetails
): Promise<any> {
  let offrampRequest: any = {
    tokenAmount: fspOfframpDetails.amount,
    paymentProviderId: fspOfframpDetails.payoutProcessorId,
    transactionHash: fspOfframpDetails.transactionHash,
    senderAddress: fspOfframpDetails.beneficiaryWalletAddress,
    xref: fspOfframpDetails.payoutUUID,
    paymentDetails: {
      creditorAgent: getBankId(fspOfframpDetails.beneficiaryBankDetails.bankName),
      creditorAccount: fspOfframpDetails.beneficiaryBankDetails.accountNumber,
      creditorName: fspOfframpDetails.beneficiaryBankDetails.accountName,
    },
  };

  if (offrampType.toLowerCase() === 'vpa') {
    offrampRequest.paymentDetails = {
      vpa: fspOfframpDetails.beneficiaryPhoneNumber,
    };
  }

  return offrampRequest;
}
```

### 4. Payment Provider Integration

#### Payment Provider Types
```typescript
interface IPaymentProvider {
  id: string;
  name: string;
  type: 'BANK' | 'MOBILE_MONEY' | 'VPA' | 'CASH';
  country: string;
  currency: string;
  supportedMethods: string[];
  processingTime: string;
  fees: {
    percentage: number;
    fixed: number;
  };
}
```

#### Payment Provider API
```typescript
async getPaymentProvider(): Promise<IPaymentProvider[]> {
  const offrampSettings = await this.fetchOfframpSettings();
  
  const response = await this.httpService.axiosRef.get(
    `${offrampSettings.url}/payment-providers`,
    {
      headers: { 'APP_ID': offrampSettings.appId }
    }
  );

  return response.data.data;
}
```


## Status Tracking

### Payout Status
```typescript
enum PayoutStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}
```

### Beneficiary Redeem Status
```typescript
interface BeneficiaryRedeem {
  uuid: string;
  beneficiaryId: string;
  payoutUUID: string;
  amount: number;
  status: PayoutStatus;
  transactionHash?: string;
  offrampResponse?: any;
  errorMessage?: string;
  numberOfAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}
```

## Monitoring and Analytics

### Payout Metrics
```typescript
interface PayoutMetrics {
  totalPayouts: number;
  totalAmount: number;
  successfulPayouts: number;
  failedPayouts: number;
  averageProcessingTime: number;
  successRate: number;
}
```

### Transaction Tracking
```typescript
async getPayoutDetails(uuid: string) {
  return {
    payout: await this.prisma.payouts.findUnique({ where: { uuid } }),
    beneficiaryRedeems: await this.prisma.beneficiaryRedeem.findMany({
      where: { payoutUUID: uuid }
    }),
    transactionHistory: await this.getTransactionHistory(uuid)
  };
}
```


## Configuration Management

### Settings Management
```typescript
// Offramp settings stored in database
interface OfframpSettings {
  URL: string;
  APP_ID: string;
  ACCESS_TOKEN: string;
  DEFAULT_PAYMENT_PROVIDER: string;
  TRANSACTION_LIMITS: {
    MIN_AMOUNT: number;
    MAX_AMOUNT: number;
    DAILY_LIMIT: number;
  };
}
```
