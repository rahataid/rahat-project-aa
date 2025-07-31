import { Module } from '@nestjs/common';
import { BankScrapeController } from './bank-scrape.controller';
import { BankScrapeService } from './bank-scrape.service';

@Module({
  controllers: [BankScrapeController],
  providers: [BankScrapeService],
  exports: [BankScrapeService],
})
export class BankScrapeModule {}
