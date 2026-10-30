# Coding patterns & architecture intent

Purpose: any agent/model touching this repo should produce the *same shape* of code, regardless of which model wrote it. Rules here are deliberately mechanical — copy the referenced real file, don't improvise a variant. Where a rule can be enforced by lint/CI instead of memory, it will be (noted inline); until then, this doc is the enforcement.

If a request conflicts with a pattern here, follow the pattern and say so — don't silently introduce a new variable (new error shape, new transport, new module layout) to satisfy the request a different way.

## 1. Module layout — one module per domain folder

Canonical reference: `apps/aa/src/fundallocation/`.

```ts
// fundallocation.module.ts
@Module({
  imports: [PrismaModule, MicroserviceAuthModule],
  controllers: [FundAllocationController],
  providers: [FundService],
})
export class FundallocationModule {}
```

- Folder name = module name (kebab/lowercase), one controller + one service minimum. Add a processor only if the module owns async/queued work.
- Don't fold unrelated concerns into an existing module because it's convenient — new domain concept gets a new folder (see the module map in [AGENT.md](../../AGENT.md)).

## 2. Controllers are RPC routers, not logic

This is a **microservice** — controllers expose `@MessagePattern`, not REST verbs. Canonical reference: `apps/aa/src/fundallocation/fundallocation.controller.ts`.

```ts
@Controller()
@UseGuards(MicroserviceAuthGuard)
export class FundAllocationController {
  constructor(private readonly fundService: FundService) {}

  @MessagePattern({ cmd: JOBS.FUND_MANAGEMENT.ADD_FUND, uuid: process.env.PROJECT_ID })
  @RequireAbility(ACTIONS.CREATE, SUBJECTS.MULTI_SIG)
  addFund(@Payload() payload: AddFund) {
    return this.fundService.addFundToProject(payload);
  }
}
```

- Every handler: `@MessagePattern({ cmd: JOBS.<DOMAIN>.<ACTION>, uuid: process.env.PROJECT_ID })`. The `cmd` value always comes from the `JOBS` constant map (`constants/index.ts`) — never an inline string literal. Adding an action means adding a `JOBS` entry first.
- Authorization: `@RequireAbility(ACTIONS.x, SUBJECTS.y)` from `common/ability.constants.ts`, guarded by `MicroserviceAuthGuard`. Don't hand-roll an auth check inside the handler.
- A controller method's body is one line: call the service, return its result. No business logic, no Prisma calls, no try/catch — that belongs in the service.

## 3. Services: business logic + one error shape

Errors thrown back across the microservice boundary are always `RpcException` with a structured payload, never a bare `Error`/string (except where already wrapped lower down):

```ts
throw new RpcException({
  message: 'Human-readable message',
  code: 'MACHINE_READABLE_CODE',   // SCREAMING_SNAKE_CASE, unique-ish per failure
  params: { groupUuid },           // whatever the caller needs to act on it
});
```

Canonical reference: any guard clause in `beneficiary.service.ts` or `grievances.service.ts`. Consistency here matters more than anywhere — the frontend (via rahat-platform) and other services pattern-match on `code`.

## 4. DTOs validate every boundary

Canonical reference: `grievances/dto/create-grievance.dto.ts`. Every `@MessagePattern` payload has a matching DTO class using `class-validator` decorators (`@IsString`, `@IsEnum`, `@IsOptional`, custom `registerDecorator` validators where needed) — not a loose `any`/interface. Prisma-generated enums (`@prisma/client`) are reused in DTOs (`@IsEnum(GrievanceType)`), never re-declared.

## 5. Settings come from `SettingsService`, never hardcoded or `.env`-read inline

```ts
const chainSettings = await this.settingsService.getPublic('CHAIN_SETTINGS');
```

All runtime-configurable values (chain type, contract addresses, FSP/SDP URLs, feature toggles) live in the `Setting` table behind `SettingsService.getPublic(key)`, keyed by a name matching a `seed-*.ts` script in `prisma/`. Adding a new tunable means adding a seed script, not a new env var, unless it's a deploy-time secret (those *do* go in `.env`, see root `CLAUDE.md`'s security rules).

## 6. Async / chain-side-effect work is always a queued processor

Never do a blockchain call, external HTTP call to an FSP/SDP, or multi-step bulk operation inline inside a controller/service method that's expected to return quickly. Pattern:

```ts
@Processor(BQUEUE.<QUEUE_NAME>)
@Injectable()
export class SomeProcessor {
  @Process({ name: JOBS.<DOMAIN>.<ACTION>, concurrency: N })
  async handle(job: Job<SomePayloadDto>) { ... }
}
```

- Queue names (`BQUEUE`) and job names (`JOBS`) are centralized in `constants/index.ts` — add to that map, don't invent ad-hoc queue name strings.
- Choose concurrency deliberately and document *why* in a comment: `1` when a shared resource (signer, nonce, serial external account) makes parallel runs unsafe; higher only for genuinely independent read-only or per-item work. See `evm.dispatcher.ts` (`EVM_TX` concurrency 1 vs `EVM_QUERY` concurrency 5) for the canonical example of this tradeoff spelled out in a comment.
- **Boot-time recovery**: if a processor can leave work half-done across a restart (a batch marked `SUBMITTED`/`PROCESSING` with no terminal status), it must scan for that state in `onModuleInit()` and re-queue it, using a stable `jobId` so Bull's dedup prevents double-processing. Canonical references: `EVMCentralizedProcessor.recoverStuckDisbursements()`, `InkindBulkRedeemProcessor.onModuleInit()`.

## 7. Chain abstraction boundary is not optional

Canonical reference: `chain/registries/chain-service.registry.ts`.

- Anything outside `chain/`, `dispatcher/`, `processors/` that needs to talk to a blockchain goes through `IChainService` (resolved via `ChainServiceRegistry.getChainService()`), never imports `EvmChainService`/`StellarChainService` directly.
- A third chain implementation plugs into `chain-service.registry.ts`'s `registerServices()` map — it does not get special-cased with `if (chainType === 'x')` branches scattered through unrelated modules. If you find yourself writing `chainType === 'evm'` outside `chain/`, that's the signal to add/use an `IChainService` method instead.
- `detectChainFromSettings()` defaults to `'evm'` on anything unexpected (missing/invalid settings) — preserve that fail-safe default if you touch this method; don't make an unconfigured deployment throw.

## 8. Spec files co-locate, one suite per unit under test

`thing.service.ts` → `thing.service.spec.ts` in the same folder. No separate `__tests__` tree, no `tests/` at repo root for unit tests (that's reserved per root `CLAUDE.md`'s `/tests` convention for anything that isn't naturally co-located, e.g. e2e). Mock-first (London School) — see root `CLAUDE.md`.

## 9. Enum source of truth is Prisma

Status/type enums (`PayoutTransactionType`, `TokenRedemptionStatus`, `GrievanceType`, etc.) are defined once in `prisma/schema.prisma` and imported from `@prisma/client` everywhere else. Never redeclare a parallel TS enum/string-union for something that already has a Prisma enum — that's exactly the "new variable" that causes drift between agents/models.

## When this doc and a request disagree

State the conflict and default to the pattern, e.g.: "Added as a new processor instead of inline in the controller — inline would skip the queue/retry/recovery pattern every other async op here uses." Don't quietly pick a third way.

## Related

- [AGENT.md](../../AGENT.md) — repo structure, module map, prisma rules.
- [chain-implementation.md](./chain-implementation.md), [beneficiary-and-vendors.md](./beneficiary-and-vendors.md), [payouts-and-offramp.md](./payouts-and-offramp.md), [inkinds.md](./inkinds.md) — subsystem deep dives that follow these patterns; treat their code as additional canonical references.

_Last updated: 2026-10-15_
