import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@rumsan/prisma';
import axios, { AxiosInstance } from 'axios';
import { SettingsService } from '@rumsan/settings';
import {
  LoginRequestDto,
  TransactionRequestDto,
  BankAutomationResponse,
} from './dto/bank-automation.dto';

@Injectable()
export class BankScrapeService implements OnModuleInit {
  private apiInstance: AxiosInstance;
  constructor(
    private readonly prisma: PrismaService,
    private settingsService: SettingsService
  ) {}

  async onModuleInit() {
    await this.getProviderApiInstance();
  }

  async getProviderApiInstance() {
    const url = await this.settingsService.getPublic('BANK_SCRAPE_URL');
    if (!url?.value) {
      throw new Error('BANK_SCRAPE_URL is not set');
    }

    this.apiInstance = axios.create({
      baseURL:
        (url?.value || 'https://bank-connect-devmode.rumsan.net/') + '/api/v1',
      headers: {
        'Content-Type': 'application/json',
        // Authorization: `Bearer ${url?.value}`,
      },
    });
  }

  async getBankList() {
    const response = await this.apiInstance.get('/banks');
    return response.data;
  }

  async getHblAccounts(
    loginData: LoginRequestDto
  ): Promise<BankAutomationResponse> {
    try {
      const response = await this.apiInstance.post(
        '/automations/hbl/accounts',
        loginData
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  async getHblTransactions(
    transactionData: TransactionRequestDto
  ): Promise<BankAutomationResponse> {
    try {
      const response = await this.apiInstance.post(
        '/automations/hbl/transactions',
        transactionData
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  async getCzbilAccounts(
    loginData: LoginRequestDto
  ): Promise<BankAutomationResponse> {
    try {
      const response = await this.apiInstance.post(
        '/automations/czbil/accounts',
        loginData
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  async getCzbilTransactions(
    transactionData: TransactionRequestDto
  ): Promise<BankAutomationResponse> {
    try {
      const response = await this.apiInstance.post(
        '/automations/czbil/transactions',
        transactionData
      );
      return {
        success: true,
        data: response.data,
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }
}
