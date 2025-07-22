export class DisbursementError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'DisbursementError';
  }
}

export class DisbursementCreationError extends DisbursementError {
  constructor(message: string, details?: any) {
    super(message, 'DISBURSEMENT_CREATION_FAILED', details);
    this.name = 'DisbursementCreationError';
  }
}

export class DisbursementNotFoundError extends DisbursementError {
  constructor(disbursementId: string) {
    super(
      `Disbursement with ID ${disbursementId} not found`,
      'DISBURSEMENT_NOT_FOUND'
    );
    this.name = 'DisbursementNotFoundError';
  }
}

export class DistributionAddressError extends DisbursementError {
  constructor(tenantName: string, details?: any) {
    super(
      `Failed to get distribution address for tenant: ${tenantName}`,
      'DISTRIBUTION_ADDRESS_ERROR',
      details
    );
    this.name = 'DistributionAddressError';
  }
}

export class AssetTransferError extends DisbursementError {
  constructor(assetCode: string, destination: string, details?: any) {
    super(
      `Failed to transfer asset ${assetCode} to ${destination}`,
      'ASSET_TRANSFER_ERROR',
      details
    );
    this.name = 'AssetTransferError';
  }
}

export class AuthenticationError extends DisbursementError {
  constructor(details?: any) {
    super('Authentication failed', 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}
