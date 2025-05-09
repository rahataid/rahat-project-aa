# Vendor Flow Documentation

## Overview

This document outlines the process for the vendor app to interact with the backend services to initiate a disbursement, send and verify OTPs, and send assets to a vendor.

## 1. Disbursement

- **Action**: `aa.stellar.disburse`
- **Payload**:
  ```json
  {
    "action": "aa.stellar.disburse",
    "payload": {
      "dName": "",
      "groups": ["uuid"]
    }
  }
  ```
- **Description**: This step initiates a disbursement process, which sets up the necessary conditions for the subsequent steps. The `dName` represents the name of the disbursement process. You can specify `"groups": ["uuid"]` to target a specific group for disbursement.

## 2. Send OTP

- **Action**: `aa.stellar.sendOtp`
- **Payload**:
  ```json
  {
    "action": "aa.stellar.sendOtp",
    "payload": {
      "phoneNumber": "",
      "amount": ""
    }
  }
  ```
- **Description**: Sends a One-Time Password (OTP) to the specified phone number. If the `amount` is specified, it represents the token amount to be considered; otherwise, the entire token balance of the beneficiary is used.

## 3. Send Asset to Vendor

- **Action**: `aa.stellar.sendAsset`
- **Payload**:
  ```json
  {
    "action": "aa.stellar.sendAsset",
    "payload": {
      "phoneNumber": "",
      "receiverAddress": "",
      "otp": "",
      "amount": ""
    }
  }
  ```
- **Description**: Transfers the specified amount of tokens to the vendor's account. This step requires a valid OTP to ensure the transaction is authorized by the beneficiary. If the `amount` is not specified, the entire token balance is considered.
