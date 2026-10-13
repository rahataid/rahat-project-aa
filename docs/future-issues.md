# Issues to address in the future

## 1. Sponsor account shared across queues can still cause nonce errors (`tx_bad_seq`)

The same Stellar sponsor account is the transaction source for several unrelated flows:

- trustline creation / account sponsorship (`STELLAR_SPONSOR`)
- offline redemption by beneficiaries (`OFFLINE_REDEEM`)
- online redeem and return tokens (`STELLAR_SEND_ASSET`)
- offramp transfers (`STELLAR_TRANSFER`, `STELLAR_TRANSFER_BATCH`)

A Stellar transaction consumes the sequence number of its **source account**. Each queue is
`concurrency: 1` on its own, but separate queues run in parallel. Two jobs from different queues
can both load the sponsor account, read the same sequence number, and build txs with the same
`seq + 1`. One succeeds and the other fails with `tx_bad_seq`. The same applies when AA runs
more than one instance, because `concurrency: 1` is per process.

Offline redemption now sends one batch tx per chunk of up to 12 items, so it uses far fewer
sequence numbers, but it can still collide with the other queues above.

### Proposed fix: channel accounts

Introduce a pool of channel accounts to use as the tx **source** (sequence provider), while the
sponsor still pays the fee and signs.

- Create N channel accounts (funded with the minimum XLM reserve).
- For each tx, lease one free channel account, use it as the source, and release it afterwards.
- Different jobs then use different sequence numbers, so they can run in parallel without
  `tx_bad_seq`.
- The lease needs a lock that works across processes (for example Redis), not an in-process
  mutex.

Until then, a per-sponsor lock around load, build, sign and submit would reduce collisions.