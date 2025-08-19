# Vendor Offline Payout Flow

This document describes the essential flow for vendor offline payouts, including OTP handling, syncing, and the relevant data structures.

## 1. Payout Creation and OTP Distribution

- When a payout is created for a vendor, the system looks up the beneficiary, and beneficiary group tables to determine which beneficiaries are associated with the relevant group.
- All these beneficiaries will receive an OTP.
- The OTP is generated and stored in the `otp` table in the database.

## 2. OTP Storage

- Each OTP is stored in the `otp` table with the following key fields:
  - `phoneNumber`: The beneficiary's phone number
  - `otpHash`: The hashed OTP (with amount)
  - `amount`: The payout amount for the beneficiary
  - `expiresAt`: Expiry date for the OTP
  - `isVerified`: Whether the OTP has been used

## 3. Fetching Offline Beneficiaries

- The vendor app fetches the list of offline beneficiaries using the following action:

```json
{
  "action": "aaProject.vendor.fetch_offline_beneficiaries",
  "payload": {
    "vendorUuid": "<VENDOR_UUID>"
  }
}
```

- The response includes each beneficiary's phone number and the OTP hash, so the vendor app can verify OTPs offline.

## 4. Offline OTP Verification

- The vendor app verifies the OTP offline and stores the result locally on the device.

## 5. Syncing Data for Token Transfer

- When ready to sync, the vendor app sends the phone number and OTP for each beneficiary to the backend for processing and token transfer.
- The sync action uses the following payload:

```json
{
  "action": "aaProject.vendor.sync_offline_data",
  "payload": {
    "vendorUuid": "<VENDOR_UUID>",
    "verifiedBeneficiaries": [
      {
        "phoneNumber": "<BENEFICIARY_PHONE>",
        "otp": "<OTP>"
      }
    ]
  }
}
```

## 6. Token Transfer and Status Update

- The backend validates the OTP and, if valid, transfers the token to the vendor.
- Only after a successful transfer is the OTP marked as verified and the payout status updated.

## Key Tables and Data

- **otp**: Stores OTPs for beneficiaries (`phoneNumber`, `otpHash`, `amount`, `expiresAt`, `isVerified`)
- **vendor**: Stores vendor details
- **beneficiary**: Stores beneficiary details
- **beneficiaryRedeem**: Tracks payout/transfer status for each beneficiary

## DTOs

- **Fetch Offline Beneficiaries**: Requires `vendorUuid` in the payload.
- **Sync Offline Data**: Requires `vendorUuid` and an array of `{ phoneNumber, otp }` objects.

Keep the flow simple: OTPs are distributed and stored, verified offline, and only synced to the backend for transfer and status update when the vendor is ready.
