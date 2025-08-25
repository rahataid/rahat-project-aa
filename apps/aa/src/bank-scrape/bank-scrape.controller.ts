import { Controller } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import { BankScrapeService } from './bank-scrape.service';
import {
  LoginRequestDto,
  TransactionRequestDto,
} from './dto/bank-automation.dto';

@Controller('bank-scrape')
export class BankScrapeController {
  constructor(private readonly bankScrapeService: BankScrapeService) {}

  @MessagePattern({
    cmd: 'aa.jobs.bank-scrape.hbl.accounts',
    uuid: process.env.PROJECT_ID,
  })
  getHblAccounts(data: LoginRequestDto) {
    return this.bankScrapeService.getHblAccounts(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.bank-scrape.hbl.transactions',
    uuid: process.env.PROJECT_ID,
  })
  getHblTransactions(data: TransactionRequestDto) {
    return this.bankScrapeService.getHblTransactions(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.bank-scrape.czbil.accounts',
    uuid: process.env.PROJECT_ID,
  })
  getCzbilAccounts(data: LoginRequestDto) {
    return this.bankScrapeService.getCzbilAccounts(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.bank-scrape.czbil.transactions',
    uuid: process.env.PROJECT_ID,
  })
  getCzbilTransactions(data: TransactionRequestDto) {
    return this.bankScrapeService.getCzbilTransactions(data);
  }

  @MessagePattern({
    cmd: 'aa.jobs.bank-scrape.banks',
    uuid: process.env.PROJECT_ID,
  })
  getBanks() {
    return this.bankScrapeService.getBankList();
  }
  @MessagePattern({
    cmd: 'aa.jobs.bank-scrape.transactions',
    uuid: process.env.PROJECT_ID,
  })
  getTransactions(data: TransactionRequestDto) {
    return this.bankScrapeService.getTransactions(data);
  }
}
