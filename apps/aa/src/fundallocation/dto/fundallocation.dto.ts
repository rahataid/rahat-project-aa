import { IsString } from 'class-validator';

export interface AddFund {
  amount: string;
}

export interface TransferListQuery {
  page?: number;
  perPage?: number;
}
