export class SendOtpDto {
  phoneNumber: string;
}

export class VerifyOtpDto {
  auth: string;
  phoneNumber: string;
  otp: string;
  verification: string;
}

export class FundAccountDto {
  walletAddress: string;
  secretKey: string;
}
