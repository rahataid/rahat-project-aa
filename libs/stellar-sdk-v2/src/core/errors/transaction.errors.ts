export class TransactionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionError';
  }
}

export class TrustlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TrustlineError';
  }
}

export class AccountNotFoundError extends Error {
  constructor(accountId: string) {
    super(`Account not found: ${accountId}`);
    this.name = 'AccountNotFoundError';
  }
}

export class TransactionAssetTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransactionAssetTransferError';
  }
}

export class TransactionConfirmationError extends Error {
  constructor(transactionHash: string, message: string) {
    super(`Transaction confirmation failed for ${transactionHash}: ${message}`);
    this.name = 'TransactionConfirmationError';
  }
}
