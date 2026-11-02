# Cash tracker

Covers `apps/aa/src/cash-tracker/` + `libs/cash-tracker/`. Has its own detailed README already — **read `apps/aa/src/cash-tracker/README.md` and `libs/cash-tracker/DEMO_MAPPING.md` first**; this doc only orients where it sits relative to everything else, not a re-explanation.

## What it is, and how it differs from the main disbursement flow

Cash Tracker is a separate blockchain operations flow for UNICEF fund flow tracking, built on **smart addresses** (tracked in Prisma, each with a stored private key + smart address) and a small fixed action set: `create_budget`, `initiate_transfer`, `confirm_transfer`. It is **not** routed through `IChainService`/`ChainServiceRegistry` ([coding-patterns.md](./coding-patterns.md)) — it has its own module-local SDK instantiation (`libs/cash-tracker`'s `core/`), dynamically created per action/entity rather than resolved per chain type. Treat it as its own bounded flow: don't wire cash-tracker actions through the EVM/Stellar chain services, and don't route general disbursement work through cash-tracker's action set.

Entry point is a `MessagePattern` cmd (`aa.jobs.cash-tracker.executeAction`) taking `{ from, to, alias, action, amount, description, proof? }` — one generic action-dispatch endpoint rather than one endpoint per action, which is the one place this module's controller shape deviates from the one-handler-per-cmd convention in coding-patterns.md; that's intentional here (the action set is UNICEF-role-gated, not free-form).

## Where it sits

Independent of beneficiary/payout/chain flows — a separate ledger for a separate funder's (UNICEF) treasury movements between its own named smart addresses (CO → Field Office → Municipality, per the README's example). If you're tracing *beneficiary* money, this module isn't on that path; if you're tracing UNICEF's own budget/transfer/confirm lifecycle, it is.

_Last updated: 2026-10-15_
