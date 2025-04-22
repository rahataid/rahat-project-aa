export class VerifyOtpDto {
  otp: string;
  verification: string;
  phone: string;
  auth: string;
  vendorPk: string;
}

export class SendOTPDto {
  tenantName: string;
  phoneNumber: string;
}
