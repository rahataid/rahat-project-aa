import { Inject, Injectable } from '@nestjs/common';
import { ReceiverService, OtpService } from '@rahat-project/stellar-sdk';
import Redis from 'ioredis';
import { logger } from 'libs/stellar-sdk/src/logger';
import { SendOTPDto, VerifyOtpDto } from './dto';

@Injectable()
export class DepositService {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {
    this.redisClient.on('error', (err) =>
      logger.error('Redis Client Error', err)
    );
  }

  async sendOTP(createDepositDto: SendOTPDto) {
    const receiverService = new ReceiverService();
    const receiver = await receiverService.createReceiverAccount();

    try {
      await this.redisClient.set(
        createDepositDto.phoneNumber,
        receiver.secretKey,
        'EX',
        6000
      );
      const sendOTP = new OtpService();
      return sendOTP.sendOTP(
        createDepositDto.tenantName,
        receiver.publicKey,
        createDepositDto.phoneNumber
      );
    } catch (error) {
      throw error;
    }
  }

  async verifyOTP(auth: string, verifyOtpDto: VerifyOtpDto) {
    const encryptedSecretKey = await this.redisClient.get(verifyOtpDto.phone);

    const verifyOTP = new OtpService();
    try {
      await verifyOTP.verifyOTP(
        auth,
        verifyOtpDto.phone,
        verifyOtpDto.otp,
        verifyOtpDto.verification
      );
      return verifyOTP.sendAsset(encryptedSecretKey, verifyOtpDto.vendorPk);
    } catch (error) {
      return error;
    }
  }
}
