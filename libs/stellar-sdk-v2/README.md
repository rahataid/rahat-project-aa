# Stellar SDK V2

A clean, type-safe SDK for Stellar blockchain operations with focus on disbursement services.

## Features

- **Clean Architecture**: Separation of concerns with proper interfaces
- **Type Safety**: Full TypeScript support with strong typing
- **Error Handling**: Custom error classes with proper context
- **Authentication**: Built-in token management with automatic refresh
- **Modular Design**: Easy to extend and maintain

## Installation

```bash
npm install @rahataid/stellar-sdk-v2
```

## Usage

### Disbursement Service

```typescript
import { DisbursementService, IDisbursementConfig } from '@rahataid/stellar-sdk-v2';

const config: IDisbursementConfig = {
  tenantName: 'your-tenant',
  email: 'admin@example.com',
  password: 'your-password',
  baseUrl: 'https://api.example.com',
  assetCode: 'RAHAT',
  assetIssuer: 'your-asset-issuer',
  assetSecret: 'your-asset-secret',
  horizonServer: 'https://horizon-testnet.stellar.org',
  network: 'testnet',
};

const disbursementService = new DisbursementService(config);

// Create a disbursement process
const result = await disbursementService.createDisbursementProcess('My Disbursement', fileBuffer, 'beneficiaries.csv', '1000');

// Get distribution address
const distributionAddress = await disbursementService.getDistributionAddress('your-tenant');

// Get disbursement details
const disbursement = await disbursementService.getDisbursement('disbursement-id');
```

### Error Handling

```typescript
import { DisbursementCreationError, DistributionAddressError } from '@rahataid/stellar-sdk-v2';

try {
  await disbursementService.createDisbursementProcess(/* ... */);
} catch (error) {
  if (error instanceof DisbursementCreationError) {
    console.error('Failed to create disbursement:', error.message);
    console.error('Error code:', error.code);
    console.error('Details:', error.details);
  } else if (error instanceof DistributionAddressError) {
    console.error('Failed to get distribution address:', error.message);
  }
}
```

## Architecture

### Core Components

- **Interfaces**: Define contracts for all services
- **Error Classes**: Custom error handling with context
- **Services**: Business logic implementation
- **Utils**: Reusable utility functions

### Directory Structure

```
src/
├── core/
│   ├── interfaces/     # Service contracts
│   ├── errors/        # Custom error classes
│   └── types/         # Type definitions
├── services/
│   ├── auth/          # Authentication service
│   ├── disbursement/  # Disbursement service
│   └── stellar/       # Stellar operations
├── utils/             # Utility functions
└── constants/         # Application constants
```

## Migration from V1

The new SDK provides a cleaner API with better error handling:

### Before (V1)

```typescript
const disbursementService = new DisbursementServices(disbursementValues, horizonServer, network);
```

### After (V2)

```typescript
const disbursementService = new DisbursementService({
  tenantName: 'your-tenant',
  email: 'admin@example.com',
  password: 'your-password',
  baseUrl: 'https://api.example.com',
  assetCode: 'RAHAT',
  assetIssuer: 'your-asset-issuer',
  assetSecret: 'your-asset-secret',
  horizonServer: 'https://horizon-testnet.stellar.org',
  network: 'testnet',
});
```

## Error Codes

- `DISBURSEMENT_CREATION_FAILED`: Failed to create disbursement
- `DISBURSEMENT_NOT_FOUND`: Disbursement not found
- `DISTRIBUTION_ADDRESS_ERROR`: Failed to get distribution address
- `ASSET_TRANSFER_ERROR`: Failed to transfer assets
- `AUTHENTICATION_ERROR`: Authentication failed
