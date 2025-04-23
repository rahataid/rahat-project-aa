export class SendOtpDto {
  phoneNumber: string;
}

export class SendAssetDto {
  amount: string;
  phoneNumber: string;
  receiverAddress: string;
}

export class FundAccountDto {
  walletAddress: string;
  secretKey: string;
}

export class AddTriggerDto {
  id: string;
}
