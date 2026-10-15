# Transport layer & multi-tenancy

This is AA's actual answer to "how does the frontend/core talk to AA" — AGENT.md says to look at rahat-platform for that conversation; this doc covers AA's own side of the wire.

## AA is a message-queue microservice, not an HTTP server

`apps/aa/src/main.ts`:

```ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
  transport: Transport.REDIS,
  options: { host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASSWORD },
});
await app.listen();
```

There is no REST controller anywhere in `apps/aa/src` reachable from outside — every `@Controller()` exposes `@MessagePattern` handlers only (see [coding-patterns.md](./coding-patterns.md)'s "controllers are RPC routers" rule). Core (rahat-platform) talks to AA by publishing a message on Redis with a matching `{ cmd, uuid }` pattern and waiting for the reply; it's a request/reply RPC over a pub/sub transport, not an API call in the HTTP sense.

## `PROJECT_ID` — multi-tenancy, not a secret

`.env.example`: `PROJECT_ID=<uuid>`. Every `@MessagePattern({ cmd: JOBS.X.Y, uuid: process.env.PROJECT_ID })` includes it. This is how **one Redis instance serves multiple AA project deployments**: each AA process only registers/responds to patterns carrying its own project's `uuid`, so several anticipatory-action projects can share infrastructure without their commands colliding. When tracing a cross-repo call, the `uuid` in the pattern is the project id, not a correlation/request id.

`BullModule.forRootAsync`'s Redis `connectionName` (`nestjs-rahat-aa-${PROJECT_ID}-${Date.now()}`) follows the same logic — queue connections are also tagged per project, useful when reading Redis/Bull dashboards across multiple deployments.

## AA → core: `CORE_MODULE`

`constants/index.ts`: `CORE_MODULE = 'RAHAT_CORE_PROJECT_CLIENT'`. This is a DI token for a `ClientProxy`, **not** a single globally-registered client — there is no app-module-level provider for it. Instead, **every module that needs to call core registers its own `ClientsModule.register([{ name: CORE_MODULE, transport: Transport.REDIS, options: {...REDIS_*} }])`** (see `beneficiary.module.ts`, `chain.module.ts`, and others). This is the established pattern: a new module calling out to core imports `ClientsModule.register([{ name: CORE_MODULE, transport: Transport.REDIS, options: { host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT, password: process.env.REDIS_PASSWORD } }])` itself — don't assume a shared provider exists, and don't invent a second token name for the same thing.

Once injected (`@Inject(CORE_MODULE) private readonly client: ClientProxy`), outbound calls either:
- fire-and-forget / request-reply via `lastValueFrom(this.client.send({ cmd: 'rahat.jobs....' }, payload))`, or
- go through the compensating wrapper `handleMicroserviceCall` ([utils.md](./utils.md)) when a local write needs to roll back on core's rejection (the grievances flow, [stakeholders-and-grievances.md](./stakeholders-and-grievances.md), is the clearest example).

`MS_TRIGGER_CLIENTS.RAHAT` (from `@rahat-project/cva`, registered once in `app.module.ts`'s `ClientsModule.register`) is a **separate** client, used by the CVA library modules internally — don't conflate it with `CORE_MODULE`; they're two different registered client names even though both transport over the same Redis.

## Core → AA, the other direction

Nothing in this app initiates that side — core/rahat-platform sends a message, AA's `@MessagePattern` handler (scoped by its own `cmd` + `PROJECT_ID`) receives and replies. If you're chasing "why doesn't my frontend action reach AA," check: (1) the `cmd` string matches a registered `JOBS.*` constant exactly, (2) the `uuid` sent matches this deployment's `PROJECT_ID`, (3) Redis connectivity — both sides must reach the same Redis instance.

## Settings vs transport config

Redis connection details (`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`) and `PROJECT_ID` are `.env` values (deploy-time, per root `CLAUDE.md`'s security rules) — not `SettingsService`-backed. Business-level runtime config (chain type, SDP/sponsor settings, feature toggles) *is* in the `Setting` table. Don't move transport config into `SettingsService`, and don't add a new business toggle as an env var — see [coding-patterns.md](./coding-patterns.md) rule 5.

_Last updated: 2026-10-15_
