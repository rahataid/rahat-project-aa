import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);
  constructor() {}

  public async xlmFaucet(walletAddress: string, amount: string) {}
}
