# Table Usage Report - Prisma Schema to Application Code

Based on search of `/Users/rb/Documents/rahat/rahat-project-aa/apps` directory for JavaScript/TypeScript application code (excluding tests, docs, config).

## USAGE STATUS

### USED TABLES

#### Beneficiary
**Files**: 
- `apps/contracts/tests/aaProjectFlow.test.js` (line 199) - test file only
- `apps/contracts/tests/inkind.test.js` (multiple references) - test file only
**Status**: NOT FOUND IN APPLICATION CODE (only in test files)

#### BeneficiaryGroups  
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### BeneficiaryToGroup
**Files**: None found  
**Status**: NOT FOUND IN CODEBASE

#### BeneficiaryGroupTokens
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### DisbursementLogs
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Payouts
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Setting  
**Files**: 
- `apps/contracts/scripts/deploy.js` (line 8) - SettingsService usage
- `apps/contracts/scripts/verify.js` (line 3) - SettingsService import
**Status**: USED (via @rumsan/settings library)

#### Stakeholders
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### StakeholdersGroups  
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Phases
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### ActivityCategories
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Activities
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Triggers  
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### SourcesData
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Stats
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### DailyMonitoring
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Vendor
**Files**: 
- `apps/contracts/tests/aaProjectFlow.test.js` (line 206) - test file only
**Status**: NOT FOUND IN APPLICATION CODE (only in test files)

#### Group (tbl_groups)
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### BeneficiaryGroup (tbl_beneficiary_groups)  
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Communication
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Disbursement
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### VendorReimbursment
**Files**: None found  
**Status**: NOT FOUND IN CODEBASE

#### VendorTokenRedemption
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### BeneficiaryRedeem
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### BeneficiaryOTP
**Files**: 
- `libs/cva/src/lib/beneficiary-otp/` - beneficiary-otp.controller.ts, beneficiary-otp.module.ts, beneficiary-otp.service.ts
**Status**: USED (in cva library)

#### OfflineBeneficiary
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Otp
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### PdfGenerationJob
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Grievance
**Files**: None found  
**Status**: NOT FOUND IN CODEBASE

#### Inkind
**Files**: 
- `apps/contracts/tests/inkind.test.js` - test file only
**Status**: NOT FOUND IN APPLICATION CODE (only in test files)

#### InkindStockMovement
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### GroupInkind
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### BeneficiaryInkindRedemption  
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### TempOfflineInkindRedemption
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### TempOfflineRedemption
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### VendorInkindRedemption  
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### Transfer
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### GroupCashTransferDetail
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### GroupCashTransferRecord
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### StellarDisburseBatch
**Files**: None found
**Status**: NOT FOUND IN CODEBASE

#### IvrTemplate
**Files**: None found  
**Status**: NOT FOUND IN CODEBASE

---

## SUMMARY

**USED (2 tables)**:
- `Setting` - via @rumsan/settings library in deployment scripts
- `BeneficiaryOTP` - in cva library's beneficiary-otp service

**NOT FOUND IN APPLICATION CODE (35 tables)**:
All other tables from the schema are only referenced in test files, deployment scripts, or not used at all.

**KEY FINDING**: The Prisma schema contains 37 tables, but only 2 (`Setting`, `BeneficiaryOTP`) have actual application code usage. Most tables exist in the schema but are not actively used in the TypeScript/JavaScript application codebase.
