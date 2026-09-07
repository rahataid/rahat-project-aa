# Offramp Progress Redis Cache Flow

## Offramp Processor — On Each Successful Offramp

When an offramp is successfully completed:

```text
Offramp Processor
       │
       ├── updateBeneficiaryRedeemAsCompleted()
       │          │
       │          └── DB write
       │
       └── Redis write
```

### Redis Operations

```text
INCR payout:progress:{uuid}:completedCount

SET payout:progress:{uuid}:data
{
    completedCount,
    totalBeneficiaries,
    totalSuccessAmount,
    status,
    lastUpdated
}

EXPIRE 5 seconds
```

## PayoutsService.findAll() — UI Polls Every 5 Seconds

The UI periodically calls the `aa.payout.list` action every 5 seconds.

```text
PayoutsService.findAll()
       │
       ├── Fetch paginated payouts from DB
       │       │
       │       └── Existing query
       │
       └── For each payout
               │
               └── CHECK Redis
                   payout:progress:{uuid}
                       │
              ┌────────┴────────┐
              │                 │
             HIT               MISS
              │                 │
              ▼                 ▼
      Use cached             Run existing
      totalSuccessAmount     calculatePayoutStatus
                             + sync logic
              │                 │
              └────────┬────────┘
                       ▼
              Return enriched response
                  (same shape)
```

## Redis Cache Behavior

### Cache HIT

If the payout progress data exists in Redis:

- Use the cached `totalSuccessAmount`.
- Use the cached progress information.
- Skip the additional DB enrichment/calculation.
- Return the enriched payout response.

### Cache MISS

If the payout progress data does not exist in Redis:

- Execute the existing `calculatePayoutStatus` and sync logic.
- Retrieve/calculate the required payout information from the database.
- Return the enriched payout response.
- Follow the existing payout calculation flow.

## Expected Result

The existing `aa.payout.list` response shape should remain unchanged.

Redis should be used as a short-lived cache for recently updated payout progress so that the UI can retrieve near real-time offramp progress while reducing unnecessary database enrichment queries.
