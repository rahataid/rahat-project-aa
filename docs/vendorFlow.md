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
      "phoneNumber": ""
    }
  }
  ```
- **Description**: Sends a One-Time Password (OTP) to the specified phone number. This OTP is used to authenticate the beneficiary before proceeding with asset transfer.

## 3. Send Asset to Vendor

- **Action**: `aa.stellar.sendAsset`
- **Payload**:
  ```json
  {
    "action": "aa.stellar.sendAsset",
    "payload": {
      "amount": "",
      "phoneNumber": "",
      "receiverAddress": "",
      "otp": ""
    }
  }
  ```
- **Description**: Transfers the specified amount of tokens to the vendor's account. This step requires a valid OTP to ensure the transaction is authorized by the beneficiary.
