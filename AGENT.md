# rahat-project-aa (AA)

Anticipatory Action (AA) service — a microservice in the Rahat ecosystem. Connects to **core** (repo: [rahat-platform](https://github.com/rahataid/rahat-platform)) which is the main platform. Any AA ↔ frontend communication goes through rahat-platform action calls, not directly against this repo. If unsure how a frontend flow reaches AA, look there first — and for AA's own side of that wire (transport, multi-tenancy via `PROJECT_ID`, how AA calls back to core), see [docs/agent/transport-and-multitenancy.md](./docs/agent/transport-and-multitenancy.md).

Stack: NestJS, Prisma/PostgreSQL, Redis, BullMQ, Nx monorepo. Dual blockchain: EVM + Stellar Soroban.

**New to this repo?** Read, in order: this file top-to-bottom → [coding-patterns.md](./docs/agent/coding-patterns.md) → [trigger-pipeline.md](./docs/agent/trigger-pipeline.md) (the project is "anticipatory **action**" — the trigger flow is the thing that makes it that, and it has real gaps worth knowing up front) → whichever other `docs/agent/*.md` matches the area you're touching, from the index below.

## Before any larger feature change

Run the `grill-with-docs` skill (mattpocock) first — it grills requirements, surfaces edge cases, and checks what's touched against existing docs before any code gets written. Use it for anything that isn't a small/mechanical change (new module, new chain operation, new payout/redemption path, schema change with behavioral impact, etc).

If the skill isn't installed in this environment, install it first:

```bash
npx skills use "https://github.com/mattpocock/skills" --skill "grill-with-docs"
```

Read its full output (redirect to a temp file first if it's long), resolve any relative paths it gives from the supporting-files directory it provides, then follow its generated instructions before implementing.

## Database / Prisma

- Schema: `prisma/schema.prisma`. Migrations: `prisma/migrations/`.
- **Before any schema change**: pull latest `origin/dev` first. Prevents stale migrations overlapping with others' in-flight migrations.
- Seed scripts live in `prisma/*.ts` (one per concern: `seed-evm-settings.ts`, `seed-stellar.ts`, etc.) — don't dump new seed logic into `seed.ts`.

## Repo structure

```
apps/
  aa/           # main NestJS app — all AA service logic
  aa-e2e/       # (ignore — e2e test scaffold, not part of domain)
  contracts/    # EVM Solidity contracts (Hardhat)
  graph/        # subgraph/indexer app
soroban/trigger/ # Stellar Soroban contract (Rust)
prisma/          # schema, migrations, seeds
```

### `apps/aa/src` — module map

Every comms path in AA flows through here. One NestJS feature module per folder:

| Folder | Purpose |
|---|---|
| `app/` | root module wiring + global settings/config sanitizing |
| `auth/` | auth module wiring |
| `beneficiary/` | beneficiary records, multisig beneficiary ops |
| `cash-tracker/` | cash distribution tracking |
| `chain/` | blockchain abstraction layer — see below |
| `comms/` | outbound comms (SMS/notifications) |
| `contracts/` | ABIs consumed at runtime (`contracts/abis/`) — not the Solidity source |
| `cron/` | scheduled jobs |
| `dispatcher/` | `evm.dispatcher.ts` — dispatches EVM-side actions |
| `dto/` | shared DTOs |
| `fundallocation/` | fund allocation to projects/beneficiaries |
| `grievances/` | grievance intake/handling |
| `group-cash-transfer/` | GCT treasury + offramp client for group cash transfers |
| `health/` | health checks |
| `inkinds/` | in-kind redemption (incl. bulk redeem processor) |
| `ivr-templates/` | IVR message templates |
| `listeners/` | event listeners wiring |
| `otp/` | OTP generation/verification |
| `payouts/` | payout lifecycle, offramp, PDF payout logs |
| `processors/` | BullMQ job processors (batch token transfer, EVM centralized processor, contract events, manual payout, inkind, beneficiary) |
| `queue/` | queue service + async queue recovery |
| `redis/` | redis module/service |
| `sse/` | server-sent events |
| `stakeholders/` | stakeholder records |
| `stats/` | stats calculation + calculators |
| `stellar-sponsor/` | Stellar fee-sponsorship service/processor |
| `stellar-transfer/` | Stellar token transfer service + batch processor |
| `triggers/` | trigger DTOs (hazard/forecast triggers) |
| `utils/` | shared utilities (e.g. evidence/media handling) |
| `validators/` | input validators |
| `vendors/` | vendor records, vendor token redemption |

### Chain abstraction (`apps/aa/src/chain/`)

Two chains supported today: **EVM** and **Stellar**. Designed to extend later.

- `interfaces/chain-service.interface.ts` — `IChainService` contract every chain implementation must satisfy (token ops, disbursement, OTP, triggers, inkind redemption, offline redemption, etc.)
- `registries/chain-service.registry.ts` — registry that resolves the right implementation by chain type. **This is the extension point** — a third chain plugs in here.
- `chain-services/evm-chain.service.ts` — EVM implementation.
- `chain-services/stellar-chain.service.ts` — Stellar implementation.
- `chain.service.ts` / `chain.controller.ts` / `chain.module.ts` / `chain-queue.service.ts` / `chain-queue.module.ts` — module wiring + queue-backed dispatch.
- `dto/`, `entities/` — chain-agnostic DTOs/entities.

When adding a new chain: implement `IChainService`, register it in `chain-service.registry.ts`, do not special-case chain type outside that boundary.

**Full flow deep dive** (contract → dispatcher → processor for EVM; direct/SDP/sponsor-trustline for Stellar): [docs/agent/chain-implementation.md](./docs/agent/chain-implementation.md). For any Stellar-specific question, also load the `stellar-dev` skill (now checked into this repo at `.claude/skills/stellar-dev/`).

### More deep-dive docs (`docs/agent/`)

| Doc | Covers |
|---|---|
| [coding-patterns.md](./docs/agent/coding-patterns.md) | Architecture intent + canonical examples — read before writing new code |
| [chain-implementation.md](./docs/agent/chain-implementation.md) | EVM contract → dispatcher → processor flow; Stellar direct/SDP/sponsor-trustline flows |
| [beneficiary-and-vendors.md](./docs/agent/beneficiary-and-vendors.md) | Token reservation, redemption types (`transactionType`), online/offline vendor redemption |
| [payouts-and-offramp.md](./docs/agent/payouts-and-offramp.md) | Payout lifecycle, `triggerPayout`, FSP/offramp fiat leg, group cash transfer |
| [inkinds.md](./docs/agent/inkinds.md) | In-kind redemption, stock tracking, bulk/offline redemption + boot recovery |
| [otp-and-events.md](./docs/agent/otp-and-events.md) | OTP generation/hashing/dev-bypass; the `EventEmitter2` event bus and its handlers |
| [utils.md](./docs/agent/utils.md) | Catalog of shared helpers (`utils/`) — check before writing a new one |
| [stakeholders-and-grievances.md](./docs/agent/stakeholders-and-grievances.md) | Stakeholder CRUD/bulk-import; grievance lifecycle + core-sync-with-compensation pattern |
| [stats.md](./docs/agent/stats.md) | Per-project dashboard stats, hazard-type calculator registry |
| [cash-tracker.md](./docs/agent/cash-tracker.md) | UNICEF smart-address treasury flow — separate from the main chain abstraction |
| [transport-and-multitenancy.md](./docs/agent/transport-and-multitenancy.md) | Redis-RPC transport, `PROJECT_ID` multi-tenancy, `CORE_MODULE` client pattern |
| [settings-reference.md](./docs/agent/settings-reference.md) | Every `SettingsService` key, what it holds, who reads it, sanitizer coverage |
| [trigger-pipeline.md](./docs/agent/trigger-pipeline.md) | **Start here for anticipatory-action triggers** — traces the real flow end to end, including the unimplemented stubs |

### EVM contracts (`apps/contracts/`)

Hardhat project, Solidity sources in `apps/contracts/src/contracts/`: `AAProject.sol`, `TriggerManager.sol`, `RahatTreasury.sol`, `RahatToken.sol`, `RahatDonor.sol`, `CashToken.sol`, `InkindRedeem.sol`, `RahatAccessManager.sol`. Compiled artifacts land in `build/artifacts/`; ABIs consumed by the app are copied into `apps/aa/src/contracts/abis/`.

### Stellar contracts (`soroban/trigger/`)

Rust/Soroban project (`Cargo.toml`, `contracts/`). Deployed via Stellar CLI (`run_deploy_loop.sh`). Counterpart to the EVM `TriggerManager.sol` — handles the trigger side on the Stellar chain.

### Shared libs (`libs/`)

Nx libraries, published as `@rahataid/*`, consumed by `apps/aa/src`:

| Lib | Package | Used for |
|---|---|---|
| `libs/cash-tracker/` | `@rahataid/cash-tracker` | cash tracking core/entities/operations — backs `cash-tracker/` module |
| `libs/cva/` | (local, used via relative/module import) | used in `app/`, `health/`, `processors/` modules |
| `libs/stellar/` | `@rahataid/stellar` | low-level Stellar client (`client.ts`) + operations/utils |
| `libs/stellar-sdk/` | `@rahataid/stellar-sdk` | Stellar SDK wrapper module/services — backs `stellar-chain.service.ts` |
| `libs/stellar-sdp/` | `@rahataid/stellar-sdp` | Stellar Disbursement Platform HTTP client (`sdp-client.ts`) |

`@rahataid/sdk` used too but is an external npm dep (`package.json`), not under `libs/`.

## Keeping docs in sync

`docs/agent/` holds deep-dive docs per subsystem (see table above for the current full list). Whenever an implementation these docs describe changes — contract logic, chain service flow, queue/processor wiring, module responsibilities, or a coding pattern itself — update the relevant `docs/agent/*.md` (and this file's module map, if a folder's purpose changed) in the same change. Don't let them drift stale.

**Every functional change to a documented subsystem** bumps a `_Last updated: YYYY-MM-DD_` line at the bottom of the doc(s) touched — update the date even if the wording barely changes, it's the audit trail for "is this doc still trustworthy." Don't bump it for typo/formatting-only edits.

## Coding patterns to follow

Full intent + copy-from examples: **[docs/agent/coding-patterns.md](./docs/agent/coding-patterns.md) — read this before writing any new module, controller, service, DTO, or processor.** It exists so any agent/model produces the same shape of code; don't improvise a variant pattern to satisfy a request — follow it and say so if there's a conflict.

Quick summary (see the doc for canonical file references and code):

- **Module per domain concern** — controller + module + service(+ processor/queue if async), mirroring the folders above.
- **Controllers are RPC routers** — `@MessagePattern({ cmd: JOBS.X.Y, uuid: process.env.PROJECT_ID })` + `@RequireAbility`, body is one line delegating to the service. No business logic in controllers.
- **One error shape** — `RpcException({ message, code, params })`, never a bare `Error`.
- **Chain-agnostic business logic** — code outside `chain/` depends on `IChainService` via `ChainServiceRegistry`, never on `evm-chain.service.ts` / `stellar-chain.service.ts` directly.
- **Async / chain-side-effect work goes through BullMQ** — `BQUEUE`/`JOBS` constants only, concurrency chosen deliberately and commented, boot-time recovery for any work that can be left half-done.
- **Settings via `SettingsService.getPublic(key)`** — never hardcoded or ad-hoc env reads for runtime-tunable values. Full key catalog: [settings-reference.md](./docs/agent/settings-reference.md). **Before adding a settings key that holds any credential/secret/private key, read `apps/aa/src/app/settings-sanitizer.ts` and add it to `SENSITIVE_SETTINGS_FIELDS`** — that file's coverage currently has real gaps (see settings-reference.md), don't assume an existing secret-bearing key is already handled.
- **DTOs for all boundaries** — `class-validator` DTOs, Prisma enums reused via `@prisma/client`, never re-declared.
- Spec files (`*.spec.ts`) sit next to the file they test.
