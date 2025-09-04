export interface BatchTransferDto {
  transfers: Array<{
    beneficiaryWalletAddress: string;
    vendorWalletAddress: string;
    amount: string;
  }>;
  batchId?: string;
}

export interface BatchTransferResult {
  success: boolean;
  batchId?: string;
  totalBatches: number;
  successfulBatches: number;
  totalTransfers: number;
  results: Array<{
    batchNumber: number;
    success: boolean;
    transactionHash?: string;
    blockNumber?: number;
    transfers: number;
    processedTransfers: number;
    error?: string;
    message?: string;
  }>;
}

export interface SingleTransfer {
  beneficiaryWalletAddress: string;
  vendorWalletAddress: string;
  amount: string;
}
