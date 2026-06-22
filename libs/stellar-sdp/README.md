# @rahataid/stellar-sdp

A typed TypeScript SDK for interacting with the [Stellar Disbursement Platform (SDP)](https://developers.stellar.org/docs/platforms/stellar-disbursement-platform) REST API.

## Setup

The library is available via the workspace path alias. No installation needed — just import:

```typescript
import { SdpClient } from '@rahataid/stellar-sdp';
```

Build with Nx:

```bash
npx nx build stellar-sdp
```

## Initialization

### With API Key (Recommended)

```typescript
import { SdpClient } from '@rahataid/stellar-sdp';

const client = new SdpClient({
  sdpUrl: 'https://sdp.example.com',
  tenantName: 'my-tenant',
  apiKey: 'your-sdp-api-key',
});

// Ready to use — no login needed
const assets = await client.assets.list();
```

### With Login Credentials

```typescript
const client = new SdpClient({
  sdpUrl: 'https://sdp.example.com',
  tenantName: 'my-tenant',
  auth: {
    email: 'user@example.com',
    password: 'password',
  },
});

// Must login explicitly before making API calls
await client.auth.login({ email: 'user@example.com', password: 'password' });
```

### With Pre-existing Token

```typescript
const client = new SdpClient({
  sdpUrl: 'https://sdp.example.com',
  tenantName: 'my-tenant',
  auth: { token: 'existing-jwt-token' },
});
```

### With Admin API

```typescript
const client = new SdpClient({
  sdpUrl: 'https://sdp.example.com',
  sdpAdminUrl: 'https://sdp-admin.example.com',
  tenantName: 'my-tenant',
  apiKey: 'your-api-key',
  adminAuth: {
    username: 'SDP-admin',
    apiKey: 'admin-api-key',
  },
});

// Admin operations (uses Basic auth)
const tenants = await client.tenants.list();
```

### NestJS Dependency Injection

```typescript
import { SdpClient } from '@rahataid/stellar-sdp';

@Module({
  providers: [
    {
      provide: 'SDP_CLIENT',
      useFactory: async (settingService: SettingsService) => {
        const settings = await settingService.getPublic('STELLAR_SETTINGS');
        return new SdpClient({
          sdpUrl: settings?.value['BASEURL'],
          sdpAdminUrl: settings?.value['ADMINBASEURL'],
          tenantName: settings?.value['TENANTNAME'],
          apiKey: settings?.value['SDP_API_KEY'],
          adminAuth: {
            username: 'SDP-admin',
            apiKey: settings?.value['SDP_ADMIN_API_KEY'],
          },
        });
      },
      inject: [SettingsService],
    },
  ],
})
export class StellarModule {}
```

## Configuration Reference

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `sdpUrl` | `string` | Yes | Base URL for SDP user API |
| `sdpAdminUrl` | `string` | No | Base URL for SDP admin API |
| `tenantName` | `string` | No | Tenant name (sent as `SDP-Tenant-Name` header) |
| `apiKey` | `string` | No | SDP API key (used as Bearer token) |
| `auth.token` | `string` | No | Pre-existing Bearer token |
| `auth.email` | `string` | No | Email for login-based auth |
| `auth.password` | `string` | No | Password for login-based auth |
| `adminAuth.username` | `string` | No | Admin API username (Basic auth) |
| `adminAuth.apiKey` | `string` | No | Admin API key (Basic auth) |
| `timeout` | `number` | No | Request timeout in ms (default: 15000) |

## API Reference

### Authentication (`client.auth`)

```typescript
// Login
const { token } = await client.auth.login({ email: '...', password: '...' });

// Refresh token
await client.auth.refreshToken();

// Multi-factor authentication
await client.auth.mfa({ mfa_code: '123456', remember_me: true });

// Forgot password
await client.auth.forgotPassword({ email: '...' });

// Reset password
await client.auth.resetPassword({ password: 'new-pass', reset_token: '...' });
```

### Tenants (`client.tenants`) — Admin API

```typescript
const tenants = await client.tenants.list();
const tenant = await client.tenants.get('tenant-id');

const newTenant = await client.tenants.create({
  name: 'new-tenant',
  distribution_account_type: 'DISTRIBUTION_ACCOUNT.STELLAR.ENV',
  owner_email: 'owner@example.com',
  owner_first_name: 'John',
  owner_last_name: 'Doe',
  organization_name: 'My Org',
});

await client.tenants.update('tenant-id', { status: 'ACTIVE' });
await client.tenants.delete('tenant-id');
await client.tenants.setDefault({ id: 'tenant-id' });
```

### Organization (`client.organization`)

```typescript
const org = await client.organization.get();

await client.organization.update({
  organization_name: 'Updated Name',
  timezone_utc_offset: '+00:00',
  is_approval_required: true,
  logo: logoBuffer, // optional Buffer
});

const logo = await client.organization.getLogo(); // returns Buffer
```

### API Keys (`client.apiKeys`)

```typescript
const keys = await client.apiKeys.list();
const key = await client.apiKeys.get('key-id');

const newKey = await client.apiKeys.create({
  name: 'my-key',
  permissions: ['read', 'write'],
  expiry_date: '2025-12-31',
  allowed_ips: ['192.168.1.1'],
});

await client.apiKeys.update('key-id', { permissions: ['read'] });
await client.apiKeys.delete('key-id');
```

### Assets (`client.assets`)

```typescript
const assets = await client.assets.list();

const asset = await client.assets.create({
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
});

await client.assets.delete('asset-id');
```

### Receivers (`client.receivers`)

```typescript
// List with pagination and filters
const receivers = await client.receivers.list({
  page: 1,
  page_limit: 20,
  status: 'READY',
  q: 'search term',
});

const receiver = await client.receivers.get('receiver-id');

const newReceiver = await client.receivers.create({
  external_id: 'ext-123',
  phone_number: '+1234567890',
  email: 'receiver@example.com',
  verifications: [{ type: 'date_of_birth', value: '1990-01-01' }],
});

await client.receivers.update('receiver-id', {
  email: 'updated@example.com',
});

// Update receiver wallet address
await client.receivers.updateWallet('receiver-id', 'wallet-id', {
  stellar_address: 'GABCD...',
  stellar_memo: 'memo',
});

// Update wallet status
await client.receivers.updateWalletStatus('wallet-id', {
  status: 'REGISTERED',
});

const verificationTypes = await client.receivers.listVerificationTypes();
```

### Disbursements (`client.disbursements`)

```typescript
// List with filters
const disbursements = await client.disbursements.list({
  page: 1,
  page_limit: 10,
  status: 'STARTED',
});

const disbursement = await client.disbursements.get('disbursement-id');

// Create a new disbursement
const newDisbursement = await client.disbursements.create({
  name: 'March Payments',
  wallet_id: 'wallet-id',
  asset_id: 'asset-id',
  verification_field: 'date_of_birth',
  registration_contact_type: 'phone_number',
});

// Update status (e.g., start or pause)
await client.disbursements.updateStatus('disbursement-id', {
  status: 'STARTED',
});

await client.disbursements.delete('disbursement-id');

// List receivers for a disbursement
const receivers = await client.disbursements.listReceivers('disbursement-id', {
  page: 1,
  page_limit: 50,
});

// Upload CSV instructions
const csvBuffer = Buffer.from('phone,amount,id\n+1234567890,100,ext-1');
await client.disbursements.uploadInstructions(
  'disbursement-id',
  csvBuffer,
  'instructions.csv'
);

// Download instructions
const csv = await client.disbursements.downloadInstructions('disbursement-id');

// List registration contact types
const contactTypes = await client.disbursements.listRegistrationContactTypes();
```

### Payments (`client.payments`)

```typescript
// List with filters
const payments = await client.payments.list({
  page: 1,
  page_limit: 20,
  status: 'SUCCESS',
  receiver_id: 'receiver-id',
});

const payment = await client.payments.get('payment-id');

// Create a direct payment
const newPayment = await client.payments.createDirect({
  amount: '100.50',
  asset: { code: 'USDC', issuer: 'GA5ZSE...' },
  receiver: { id: 'receiver-id' },
  wallet: { id: 'wallet-id' },
  external_payment_id: 'ext-pay-123',
});

// Retry failed payments
await client.payments.retry({ payment_ids: ['pay-1', 'pay-2'] });

// Cancel a payment
await client.payments.updateStatus('payment-id', { status: 'CANCELED' });
```

### Statistics (`client.statistics`)

```typescript
const stats = await client.statistics.getAll();
const disbursementStats = await client.statistics.getByDisbursement('disbursement-id');
```

### Balances (`client.balances`)

```typescript
const balances = await client.balances.get();
```

## Token Management

When using API key auth, the token is set automatically. For login-based auth:

```typescript
// Token is set automatically after login
await client.auth.login({ email: '...', password: '...' });

// Manually set/clear token
client.setToken('new-token');
client.clearToken();

// Refresh token (also updates internal token)
await client.auth.refreshToken();
```
