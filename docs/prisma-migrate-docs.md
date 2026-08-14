# Prisma Migration Guide

Run from repo root: `/Users/rb/Documents/rahat/rahat-project-aa`

Two playbooks. Never mix them up.

- **Local dev DB** — free to reset/wipe.
- **Dev-stage / Prod** — never wipe, never `migrate dev`. Baseline instead.

---

## Local dev

New schema change:

```bash
npx prisma migrate dev --name <feature_name>
```

Nuke local data, start clean:

```bash
npx prisma migrate reset
```

---

## Dev-stage / Prod — copy-paste sequence

Set the target DB connection once per terminal session, then run the blocks in order.

```bash
export TARGET_DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=public"
```

### 1. Backup

```bash
pg_dump "$TARGET_DATABASE_URL" -Fc -f "backup-$(date +%Y%m%d-%H%M%S).dump"
```

Confirm the file isn't empty before continuing:

```bash
ls -la backup-*.dump
```

### 2. Check drift

```bash
npx prisma migrate diff \
  --from-url "$TARGET_DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > /tmp/drift-check.sql

cat /tmp/drift-check.sql
```

Expected in the output (harmless, already accounted for): `DROP TABLE` statements for tables removed from `schema.prisma` on 2026-08-14 — `tbl_activities`, `tbl_activity_categories`, `tbl_beneficiary_groups`, `tbl_beneficiary_otp`, `tbl_communications`, `tbl_daily_monitoring`, `tbl_disbursement`, `tbl_disbursement_logs`, `tbl_groups`, `tbl_offline_beneficiaries`, `tbl_phases`, `tbl_sources_data`, `tbl_triggers`, `tbl_vendor_reimbursment`.

If the output shows anything else — stop, don't continue to step 3, investigate first.

### 3. Baseline the rewritten migration history

The migration folder was rebuilt on 2026-08-14 (48 old migrations replaced with these 12). Run this once per environment, in order:

```bash
npx prisma migrate resolve --applied 20260814120000_beneficiaries_core --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120001_settings --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120002_stakeholders_vendor --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120003_core_cva_redemption --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120004_otp --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120005_pdf_generation_job --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120006_grievance --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120007_inkind --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120008_transfer --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120009_group_cash_transfer --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120010_stellar_disburse_batch --schema=prisma/schema.prisma
npx prisma migrate resolve --applied 20260814120011_ivr_templates --schema=prisma/schema.prisma
```

`prisma migrate resolve` reads `DATABASE_URL` from the environment, not `--from-url`. Make sure it's set to the same target before running:

```bash
export DATABASE_URL="$TARGET_DATABASE_URL"
```

then run the 12 commands above.

### 4. Confirm clean

```bash
npx prisma migrate status
```

Must print: `Database schema is up to date!`

### 5. From now on

Any future migration, deploy normally:

```bash
npx prisma migrate deploy
```

Do **not** run `migrate resolve` again unless history gets rewritten a second time.

**One-time-only note:** steps 1–4 above only need to run once per environment (dev-stage once, prod once). Skip them entirely for any environment already baselined.

---

## Full reset — nuke DB and rebuild from a filtered dump

Use this when a DB (local, or a brand-new environment) needs to be wiped entirely and rebuilt from a data dump that contains tables not present in the current `schema.prisma` — e.g. the dump predates a schema cleanup. This is what was done locally on 2026-08-14.

**Never run this against dev-stage/prod with real live traffic.** If a shared environment genuinely needs this, coordinate downtime first.

### 1. Backup first, no exceptions

```bash
export TARGET_DATABASE_URL="postgresql://<user>:<password>@<host>:<port>/<dbname>?schema=public"
pg_dump "$TARGET_DATABASE_URL" -Fc -f "backup-$(date +%Y%m%d-%H%M%S).dump"
```

### 2. Drop and recreate the schema

```bash
psql "$TARGET_DATABASE_URL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
```

Everything in that DB is gone after this. The backup from step 1 is the only way back.

### 3. Apply migrations fresh

```bash
export DATABASE_URL="$TARGET_DATABASE_URL"
npx prisma migrate deploy
```

Recreates every table from the current `prisma/migrations/` folder, matching `schema.prisma` exactly. Nothing else.

### 4. Build the filtered restore list — only tables that still exist in the schema

Your dump (`your-data.dump`) may contain tables Prisma no longer tracks. Restoring them will either error (table doesn't exist) or silently leave orphan data. Filter them out before restoring:

```bash
pg_restore -l your-data.dump > /tmp/full.list
```

```bash
python3 << 'EOF'
# List every table @@map'd in schema.prisma that should NOT be restored
# (dropped models, or tables the dump has that were never in the schema).
exclude_tables = {
    "tbl_activities", "tbl_activity_categories", "tbl_beneficiary_groups",
    "tbl_beneficiary_otp", "tbl_communications", "tbl_daily_monitoring",
    "tbl_disbursement", "tbl_disbursement_logs", "tbl_groups",
    "tbl_offline_beneficiaries", "tbl_phases", "tbl_sources_data",
    "tbl_triggers", "tbl_vendor_reimbursment",
}
exclude_names = set(exclude_tables) | {f"{t}_id_seq" for t in exclude_tables}

out = []
with open("/tmp/full.list") as f:
    for line in f:
        stripped = line.rstrip("\n")
        if stripped.startswith(";") or not stripped.strip():
            out.append(line)
            continue
        if "TABLE DATA" in stripped or "SEQUENCE SET" in stripped:
            name = stripped.split()[-2]
            if name in exclude_names:
                continue
        out.append(line)

with open("/tmp/restore_filtered.list", "w") as f:
    f.writelines(out)
EOF
```

Sanity-check what's left before restoring:

```bash
grep "TABLE DATA" /tmp/restore_filtered.list | awk '{print $(NF-1)}' | sort
```

Compare that list against the models in `schema.prisma` (`@@map(...)` names) — every table listed should have a matching model, nothing more.

**Important:** matching table names with `grep -v -E` on a pattern list is unreliable — `tbl_disbursement` as a pattern also silently fails to exclude `tbl_disbursement_id_seq` (no word-boundary match), leaking orphan sequences back in. Use the exact-name Python match above, not a regex exclude.

### 5. Restore, with triggers disabled

```bash
pg_restore "$TARGET_DATABASE_URL" --data-only --disable-triggers -L /tmp/restore_filtered.list your-data.dump
```

`--disable-triggers` matters if any table has custom insert/update triggers (e.g. the inkind stock-movement guards) — those would reject historical rows that don't satisfy today's invariants otherwise.

An error like `unrecognized configuration parameter "transaction_timeout"` is safe to ignore — it's a `pg_dump`/server version mismatch on a session setting, not data loss. Confirm with row counts (next step) rather than trusting the log alone.

### 6. Verify

```bash
npx prisma migrate status
npx prisma generate
```

Then spot-check row counts on a few key tables against what you expect:

```bash
psql "$TARGET_DATABASE_URL" -c "SELECT count(*) FROM tbl_beneficiaries;"
```

Also check sequences aren't behind the restored data (would cause duplicate-key errors on the next insert):

```bash
psql "$TARGET_DATABASE_URL" -c "
SELECT 'max id', max(id) FROM tbl_beneficiaries
UNION ALL SELECT 'seq value', last_value FROM tbl_beneficiaries_id_seq;
"
```

Both numbers should match. `pg_restore --data-only` includes `setval()` calls for sequences in the dump, so this is normally already correct — just confirm.

---

## Optional: trim old `_prisma_migrations` rows

Not required — stale rows are ignored by Prisma. Only do this after step 4 confirms clean:

```sql
DELETE FROM _prisma_migrations WHERE migration_name NOT IN (
  '20260814120000_beneficiaries_core',
  '20260814120001_settings',
  '20260814120002_stakeholders_vendor',
  '20260814120003_core_cva_redemption',
  '20260814120004_otp',
  '20260814120005_pdf_generation_job',
  '20260814120006_grievance',
  '20260814120007_inkind',
  '20260814120008_transfer',
  '20260814120009_group_cash_transfer',
  '20260814120010_stellar_disburse_batch',
  '20260814120011_ivr_templates'
);
```

Run via:

```bash
psql "$TARGET_DATABASE_URL" -c "DELETE FROM _prisma_migrations WHERE migration_name NOT IN ('20260814120000_beneficiaries_core','20260814120001_settings','20260814120002_stakeholders_vendor','20260814120003_core_cva_redemption','20260814120004_otp','20260814120005_pdf_generation_job','20260814120006_grievance','20260814120007_inkind','20260814120008_transfer','20260814120009_group_cash_transfer','20260814120010_stellar_disburse_batch','20260814120011_ivr_templates');"
```

---

## Rules of thumb

- `migrate dev` → local only.
- `migrate deploy` → CI/CD, dev-stage, prod. Never generates migrations.
- `migrate reset` → local only, destroys data.
- `migrate resolve --applied` → one-time baseline tool per environment, only needed because history was rewritten 2026-08-14.
- Always backup before touching dev-stage/prod, no exceptions.
- Always run the drift check before step 3 on an environment you haven't baselined yet.
