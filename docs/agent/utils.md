# Shared utils (`apps/aa/src/utils/`)

Biggest undocumented module by line count (~1900 lines) precisely because every other doc references its functions by name without saying where they live or what they guarantee. Catalog, grouped by concern — not line-by-line, just "what's in here and why you'd reach for it":

| File | Purpose |
|---|---|
| `hash.ts` | OTP hashing/verification (`getOtpHash`, `verifyOtpHash`) — see [otp-and-events.md](./otp-and-events.md) |
| `evidence.ts` | `MediaItem`/`toMediaItems`/`getInfoMedia` — normalizes the legacy single-`mediaUrl`-string shape and the new `[{mediaUrl, filename}]` array shape used by CVA evidence (payouts, redemptions). Any code reading/writing redeem media goes through this, never parses `info.mediaUrl` ad hoc. |
| `date.ts` | `getFormattedTimeDiff` — used for the `group_gap` payout metric (payouts-and-offramp.md) and elsewhere time deltas need human formatting |
| `getBeneficiaryRedemStatus.ts` | `calculatePayoutStatus` + `REDEEM_COMPLETED_STATUSES`/`REDEEM_PAID_STATUSES` — the single place that maps a set of `BeneficiaryRedeem` rows to an overall payout status. Any new redemption status must be added here, not re-derived locally in a service. |
| `utility.ts` | Grab-bag of small pure helpers: `chunkArray` (batching — used throughout chain/queue code), `lowerCaseObjectKeys`, `generateRandomTxHash` (test/dev fixtures), `normalizeRequiredFields`, `parseValueForPrisma` (settings value coercion by `dataType`) |
| `parseJsonFields.ts` | `parseJsonField` — safe JSON-field parsing from Prisma `Json` columns |
| `validPhone.ts` | `isValidPhone` — the one phone-format validator; DTOs validating a phone field should use this, not a bespoke regex |
| `web3.ts` | `createContractInstance` / `createContractInstanceSign` / `getContractByName` / `getWalletFromPrivateKey` — ethers.js contract/wallet bootstrapping from settings-stored addresses/ABIs. Used by `fundallocation.service.ts` and other EVM-adjacent code that isn't routed through `IChainService` (contract read/write for non-disbursement operations). |
| `bank.ts` | `CIPS_BANK` list + `getBankId`/`getBankName` — static bank directory for the FSP/CIPS offramp integration (payouts-and-offramp.md) |
| `bullUtils.ts` | `canProcessJob` — guards around BullMQ job processing (e.g. re-entrancy/chain-type checks before a processor runs) |
| `health.check.ts` | Per-dependency health probes (`checkDatabase`, `checkRedis`, `checkRPCUrl`, `checkCloudflare`, `checkTriggerService`, `checkOffRampService`) + `updateHealthStatus` — backs the `health/` module's aggregate status, each check independent so one dependency being down doesn't mask the others |
| `index.ts` | Stats-shaping helpers (`getAgeGroup`, `mapAgeGroupCounts`, `countBySSAType`, `countResult`, `generateLocationStats`, `extractLatLng`, `toPascalCase`) — generic aggregation helpers consumed by `stats/` calculators, not stats-specific logic itself |
| `vulnerabilityCountHelpers.ts` | `mapVulnerabilityStatusCount` — same shape, vulnerability-specific stat aggregation |
| `handleMicroServiceCall.ts` | `handleMicroserviceCall({ client, onSuccess, onError })` — the wrapper for calling out to **core** (rahat-platform) over the microservice `ClientProxy`, with explicit success/error branches. This is *the* pattern for any AA → core call (see `grievances.service.ts`'s create flow, which rolls back the local row via `onError` if core rejects it) — use this wrapper, don't `lastValueFrom(client.send(...))` raw when a compensating action is needed on failure. |
| `constant.ts` | Static data (e.g. `erc20Abi`) — not business constants (those are `constants/index.ts` at `apps/aa/src/constants/`, don't confuse the two) |
| `version.helper.ts` | `getVersionFromPackageJson` — reads the running app's version for health/diagnostics |

## Pattern

If you're about to write a new helper, check this table first — phone validation, redeem-status rollup, media normalization, and the core-call wrapper all already exist and are depended on by multiple modules; a second implementation of any of these is exactly the kind of "new variable" [coding-patterns.md](./coding-patterns.md) warns against.

_Last updated: 2026-10-15_
