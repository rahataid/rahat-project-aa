/**
 * Token disbursement & redemption report.
 *
 * Computes, across ALL beneficiaries regardless of payout type (FSP/VENDOR)
 * or mode (ONLINE/OFFLINE):
 *   - assignedTokens       SUM(BeneficiaryGroupTokens.numberOfTokens)
 *   - disbursedTokens      SUM(...) WHERE isDisbursed = true
 *   - pendingDisbursement  assignedTokens - disbursedTokens
 *   - redeemedTokens       SUM(BeneficiaryRedeem.amount) for the final leg of
 *                          each channel (VENDOR_REIMBURSEMENT/COMPLETED for
 *                          vendor/walk-in, FIAT_TRANSFER/FIAT_TRANSACTION_COMPLETED
 *                          for FSP) — excludes the intermediate TOKEN_TRANSFER leg.
 *
 * Usage:
 *   ts-node scripts/token-stats.ts [path/to/.env]
 *   (defaults to the repo root .env if no path is given)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

function resolveEnvValue(value: string, envMap: Map<string, string>): string {
  return value.replace(/\$\{([^}]+)\}/g, (_match, key) => {
    const resolved = envMap.get(key);
    if (resolved === undefined) {
      throw new Error(`Environment variable ${key} not found in .env file`);
    }
    return resolveEnvValue(resolved, envMap);
  });
}

async function readEnvFile(envPath: string): Promise<Map<string, string>> {
  const envData = await fs.readFile(envPath, 'utf8');
  const rawMap = new Map<string, string>();

  envData.split('\n').forEach((line) => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      rawMap.set(key.trim(), valueParts.join('=').trim());
    }
  });

  const resolvedMap = new Map<string, string>();
  for (const [key, value] of rawMap.entries()) {
    resolvedMap.set(key, resolveEnvValue(value, rawMap));
  }
  return resolvedMap;
}

async function resolveDatabaseUrl(): Promise<string> {
  const envPathArg = process.argv[2];
  const envPath = envPathArg
    ? path.resolve(envPathArg)
    : path.resolve(__dirname, '../.env');

  try {
    const envMap = await readEnvFile(envPath);
    const url = envMap.get('DATABASE_URL');
    if (url) return url;
  } catch {
    // fall through to process.env below
  }

  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  console.error(
    `Could not resolve DATABASE_URL. Tried env file at ${envPath} and process.env.DATABASE_URL.\n` +
      'Usage: ts-node scripts/token-stats.ts [path/to/.env]'
  );
  process.exit(1);
}

// The only BeneficiaryRedeem rows that represent tokens actually reaching a
// beneficiary. TOKEN_TRANSFER (FSP's internal project-wallet -> offramp leg)
// is intentionally excluded.
const REDEEMED_LEGS = [
  { transactionType: 'VENDOR_REIMBURSEMENT', status: 'COMPLETED' },
  { transactionType: 'FIAT_TRANSFER', status: 'FIAT_TRANSACTION_COMPLETED' },
] as const;

interface TypeModeBreakdown {
  type: string;
  mode: string;
  assignedTokens: number;
  disbursedTokens: number;
  pendingDisbursement: number;
}

async function main() {
  const databaseUrl = await resolveDatabaseUrl();
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  try {
    // ---------- Assigned / Disbursed / Pending ----------
    const groupTokens = await prisma.beneficiaryGroupTokens.findMany({
      select: {
        numberOfTokens: true,
        isDisbursed: true,
        payout: { select: { type: true, mode: true } },
      },
    });

    let assignedTokens = 0;
    let disbursedTokens = 0;
    const breakdownMap = new Map<string, TypeModeBreakdown>();

    for (const gt of groupTokens) {
      const tokens = gt.numberOfTokens || 0;
      assignedTokens += tokens;
      if (gt.isDisbursed) disbursedTokens += tokens;

      const type = gt.payout?.type ?? 'NO_PAYOUT';
      const mode = gt.payout?.mode ?? 'NO_PAYOUT';
      const key = `${type}:${mode}`;

      if (!breakdownMap.has(key)) {
        breakdownMap.set(key, {
          type,
          mode,
          assignedTokens: 0,
          disbursedTokens: 0,
          pendingDisbursement: 0,
        });
      }
      const entry = breakdownMap.get(key)!;
      entry.assignedTokens += tokens;
      if (gt.isDisbursed) entry.disbursedTokens += tokens;
    }

    for (const entry of breakdownMap.values()) {
      entry.pendingDisbursement = entry.assignedTokens - entry.disbursedTokens;
    }

    const pendingDisbursement = assignedTokens - disbursedTokens;

    // ---------- Redeemed ----------
    const redeemRecords = await prisma.beneficiaryRedeem.findMany({
      where: { OR: [...REDEEMED_LEGS] },
      select: {
        amount: true,
        transactionType: true,
        beneficiaryWalletAddress: true,
        payout: { select: { mode: true } },
      },
    });

    let redeemedTokens = 0;
    const redeemedWallets = new Set<string>();
    const redeemedByChannel: Record<string, number> = {
      VENDOR_REIMBURSEMENT: 0,
      FIAT_TRANSFER: 0,
    };
    const redeemedByMode: Record<string, number> = {};

    for (const r of redeemRecords) {
      redeemedTokens += r.amount;
      redeemedWallets.add(r.beneficiaryWalletAddress);
      redeemedByChannel[r.transactionType] =
        (redeemedByChannel[r.transactionType] || 0) + r.amount;

      const mode = r.payout?.mode ?? 'UNKNOWN';
      redeemedByMode[mode] = (redeemedByMode[mode] || 0) + r.amount;
    }

    const result = {
      generatedAt: new Date().toISOString(),
      summary: {
        assignedTokens,
        disbursedTokens,
        pendingDisbursement,
        redeemedTokens,
        redeemedBeneficiaryCount: redeemedWallets.size,
      },
      breakdownByTypeMode: Array.from(breakdownMap.values()),
      redeemedByChannel,
      redeemedByMode,
    };

    // ---------- Print ----------
    console.log('\n===== Token Disbursement & Redemption Report =====\n');
    console.table([
      { Metric: 'Assigned Tokens', Value: assignedTokens },
      { Metric: 'Disbursed Tokens', Value: disbursedTokens },
      { Metric: 'Pending Disbursement', Value: pendingDisbursement },
      { Metric: 'Redeemed Tokens', Value: redeemedTokens },
      { Metric: 'Beneficiaries Redeemed', Value: redeemedWallets.size },
    ]);

    console.log('--- Breakdown by Payout Type / Mode (Assigned vs Disbursed) ---');
    console.table(result.breakdownByTypeMode);

    console.log('--- Redeemed by Channel ---');
    console.table(redeemedByChannel);

    console.log('--- Redeemed by Payout Mode ---');
    console.table(redeemedByMode);

    // ---------- Write JSON ----------
    const outDir = path.resolve(__dirname, 'output');
    await fs.mkdir(outDir, { recursive: true });
    const fileName = `token-stats-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const outPath = path.join(outDir, fileName);
    await fs.writeFile(outPath, JSON.stringify(result, null, 2), 'utf8');
    console.log(`Full report written to ${outPath}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Failed to generate token stats report:', error);
  process.exit(1);
});
