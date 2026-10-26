# AA trigger pipeline — codebase structure

Built manually (graphify's own pip-based installer was declined for this session — see note at bottom), tracing the actual trigger flow through the repo rather than the usual per-folder doc. Read this when asked "how does a trigger actually fire a disbursement" — the honest answer is: **most of the write-side trigger path is a stub.** This doc says exactly where the real wiring is, and where it isn't.

## The pipeline, as it actually exists in this repo

```
1. Hazard/forecast data source
   Setting: DATASOURCE (per watershed — seed-karnali.ts, seed-babai.ts)
   Setting: HAZARD_TYPE / PROJECTINFO.PROJECT_TYPE → selects FLOOD or HEAT_WAVE
   → stats/stat-calculators/{flood,heat-wave}/ compute dashboard indicators (see stats.md)
   This is descriptive/dashboard only — it does not itself decide to fire a trigger.

2. Trigger evaluation & on-chain recording — NOT implemented in this repo (see below)

3. On-chain trigger ledger (exists, deployed, but not driven from AA's app code)
   EVM:     apps/contracts/src/contracts/TriggerManager.sol — trigger(sourceId), hasTriggered()
   Stellar: soroban/trigger/ — Soroban equivalent
   AAProject.sol holds a TriggerManager reference, but assignClaims()'s
   `require(TriggerManager.hasTriggered(), ...)` gate is commented out — triggering
   is tracked on-chain but does not currently gate token assignment.

4. Automated response once a trigger/condition is recorded
   Setting: DISBURSED_ON_CREATE (boolean)
   Event:   EVENTS.GROUP_TOKEN_RESERVED_FOR_DISBURSE (emitted by beneficiary.service.ts's
            reserveTokenToGroup — see beneficiary-and-vendors.md)
   Handler: listeners.service.ts's onTokenReservedDisburseOnCreate — if the setting is on,
            calls chainService.preDisburse() immediately on reservation.
   This part IS implemented and is the actual "automated" behavior in this codebase today.

5. EVENTS.AUTOMATED_TRIGGERED — handled, never emitted, from this repo
   listeners.service.ts has a handler (handleAutomatedTrigger) that removes a matching
   repeatable job from BQUEUE.SCHEDULE once this event fires. Nothing in apps/aa/src
   ever emits EVENTS.AUTOMATED_TRIGGERED, and nothing in apps/aa/src ever adds a
   repeatable job to BQUEUE.SCHEDULE either (BQUEUE.SCHEDULE and BQUEUE.TRIGGER are
   both registered/injected — app.module.ts, queue.service.ts — but have no
   @Processor anywhere in this repo).
   Conclusion: the actual forecast-evaluation scheduler that decides "a threshold was
   crossed, fire the automated trigger" lives outside this repo (core/rahat-platform,
   or a not-yet-built service) and reaches into this repo's Redis/queues/event bus
   from the outside. If you're hunting for "where does the automated trigger logic
   live," it is not here — check rahat-platform next.
```

## Chain-service trigger methods: confirmed stubs

`IChainService` declares `addTrigger?`, `addTriggerOnChain?`, `updateTrigger?` (optional — see `chain/interfaces/chain-service.interface.ts`). Both implementations exist but neither does anything:

- `evm-chain.service.ts: addTrigger()` / `updateTriggerParams()` — both throw `RpcException({code: 'EVM_TRIGGERS_NOT_IMPLEMENTED'})`.
- `stellar-chain.service.ts: addTrigger()` / `updateTrigger()` — both throw `RpcException({code: 'NOT_SUPPORTED_ON_STELLAR_SDP'})`.
- Neither method is even exposed on `chain.controller.ts` — there is no `@MessagePattern` for a trigger cmd at all, so these methods aren't externally reachable today regardless.
- `apps/aa/src/triggers/` (the module folder name you'd expect to hold this logic) contains exactly one unused-looking DTO (`BeneficiaryCSVData`) — it is not where trigger logic lives or will live without further work.

**If you're asked to implement real on-chain triggering from AA**: this is the extension point — fill in `addTrigger`/`addTriggerOnChain` in both chain services (calling `TriggerManager.trigger(sourceId)` / the Soroban equivalent), wire a `@MessagePattern` on `chain.controller.ts`, and decide whether to re-enable `AAProject.sol`'s commented-out `hasTriggered()` gate.

## Dead code noticed while tracing this

`processors/evm-centralized.processor.ts` imports `TriggerManagerABI` (`require('../contracts/abis/TriggerManager.json')`) but never references it anywhere else in the file — an unused import, consistent with the trigger-write path being unfinished rather than removed.

## Why this doc exists

`grill-with-docs`/architecture docs elsewhere in `docs/agent/` describe what's built. This one exists specifically because "the trigger pipeline" sounds like it should be a clean end-to-end flow and isn't — a new dev or agent tracing it from `TriggerManager.sol` forward will hit dead ends at the chain-service stubs and should know that's expected, not a bug in their understanding.

## Note on how this doc was built

Requested via the `graphify` skill (knowledge-graph extraction over the repo). Its first step bootstraps itself with `pip install graphifyy`, which this session's sandbox denied ("Code from External"). Rather than route around that, this doc was built the same way every other `docs/agent/*.md` in this repo was — direct code tracing (grep + read), not a generated graph. If graphify's installer is approved in a future session, re-running `/graphify apps/aa/src` would be a good cross-check against this doc, not a replacement for it.

_Last updated: 2026-10-26_
