# Cash Tracker Microservice

The Cash Tracker microservice provides blockchain operations for UNICEF fund flow using smart addresses and database entities. The system automatically handles initialization and dynamic SDK creation based on actions.

## Overview

The service works with:

- **Smart Addresses**: The blockchain addresses that execute transactions
- **Database Entities**: Entities stored in Prisma database with private keys and smart addresses
- **Actions**: Core operations based on UNICEF user stories (create_budget, initiate_transfer, confirm_transfer)

## System Flow

1. **Automatic Initialization**: Module initializes with settings from database/environment
2. **Dynamic SDK Creation**: SDK instances created based on action and entities from database
3. **Execute Actions**: Pass smart addresses for blockchain operations
4. **Transaction Recording**: All transactions recorded for tracking

## Usage Example

### Execute Actions

#### Create Budget (UNICEF Nepal CO only)

```typescript
const createBudgetAction = {
  from: '0xE17Fa0F009d2A3EaC3C2994D7933eD759CbCe257', // UNICEF Nepal CO smart address
  to: '0xB4b85A39C44667eDEc9F0eB5c328954e328E980B', // UNICEF Nepal Field Office smart address
  alias: 'UNICEF Nepal CO',
  action: 'create_budget',
  amount: '1000000000000000000', // 1 token (18 decimals)
  description: 'Budget creation for field office',
};

const result = await this.client.send('aa.jobs.cash-tracker.executeAction', createBudgetAction);
```

#### Initiate Transfer (UNICEF Nepal CO or Field Office)

```typescript
const initiateTransferAction = {
  from: '0xB4b85A39C44667eDEc9F0eB5c328954e328E980B', // UNICEF Nepal Field Office smart address
  to: '0xe5159f997F32D04F9276567bb2ED4CC0CdC9D8E4', // Municipality smart address
  alias: 'UNICEF Nepal Field Office',
  action: 'initiate_transfer',
  amount: '500000000000000000', // 0.5 tokens
  proof: 'base64_encoded_proof_document',
  description: 'Transfer to municipality',
};

const result = await this.client.send('aa.jobs.cash-tracker.executeAction', initiateTransferAction);
```

#### Confirm Transfer (Any role)

```typescript
const confirmTransferAction = {
  from: '0xe5159f997F32D04F9276567bb2ED4CC0CdC9D8E4', // Municipality smart address
  to: '0xB4b85A39C44667eDEc9F0eB5c328954e328E980B', // UNICEF Nepal Field Office smart address
  alias: 'Municipality',
  action: 'confirm_transfer',
  amount: '500000000000000000', // 0.5 tokens
  description: 'Confirming transfer',
};

const result = await this.client.send('aa.jobs.cash-tracker.executeAction', confirmTransferAction);
```

### Get Transactions (Comprehensive Flow History)

```typescript
const flowHistory = await this.client.send('aa.jobs.cash-tracker.getTransactions');

// Returns comprehensive flow history with:
// - Entity balances, sent, received amounts
// - Pending allowances
// - Transaction flows with timestamps
// - Smart address mappings
```

## Available Actions

- **`create_budget`**: UNICEF Nepal CO creates budget for Field Office
- **`initiate_transfer`**: UNICEF Nepal CO or Field Office initiates transfer
- **`confirm_transfer`**: Any role confirms transfer
- **`approve`**: Basic approve operation
- **`allowance`**: Check allowance between entities
- **`transfer`**: Basic transfer operation

## Transaction Flow History

The `getTransactions` endpoint returns comprehensive flow history including:

- **Entity Balances**: Current balance, sent, and received amounts for each entity
- **Pending Allowances**: Outstanding allowances between entities
- **Transaction Flows**: Complete transaction history with timestamps and flow direction
- **Smart Address Mapping**: Links between smart addresses and entity aliases

Example response structure:

```typescript
{
  entities: [
    {
      alias: 'UNICEF Nepal CO',
      balance: '1000.0',
      sent: '500.0',
      received: '0.0',
      pending: [{ to: 'UNICEF Nepal Field Office', amount: '200.0' }],
      flows: [{ from: 'UNICEF Nepal CO', to: 'UNICEF Nepal Field Office', amount: '300.0', type: 'sent' }],
    },
  ];
}
```

## Role-Based Validation

- **UNICEF Nepal CO**: Can create budget and initiate transfers
- **UNICEF Nepal Field Office**: Can initiate transfers
- **Municipality**: Can confirm transfers
- **Beneficiary**: Can receive funds

## Database Integration

Entities are stored in the database with this structure:

```typescript
{
  privateKey: string;
  address: string;
  smartAccount: string;
  alias: string;
  role: 'UNICEF_NEPAL_CO' | 'UNICEF_NEPAL_FIELD_OFFICE' | 'MUNICIPALITY' | 'BENEFICIARY';
}
```

## System Configuration

The system automatically configures itself using environment variables:

- `CASH_TRACKER_RPC_URL`: Network RPC URL
- `CASH_TRACKER_ENTRY_POINT`: Entry point contract address
- `CASH_TRACKER_CONTRACT_ADDRESS`: Cash token contract address
- `CASH_TRACKER_FACTORY_ADDRESS`: Smart account factory address

## Security Notes

- Private keys are stored securely in the database
- The service creates temporary SDK instances for each operation
- All SDK instances are cleaned up after operations
- Smart addresses are used for transaction identification
- Role-based validation prevents unauthorized actions

## Error Handling

The service will throw errors if:

- Entity not found for smart address
- Invalid action for user role
- Network/contract configuration issues
- Transaction failures

## Available Endpoints

- `aa.jobs.cash-tracker.executeAction` - Execute blockchain actions
- `aa.jobs.cash-tracker.getTransactions` - Get transaction history
