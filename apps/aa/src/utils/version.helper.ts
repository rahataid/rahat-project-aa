import { promises as fs } from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';

let cached: string | null = null;
const logger = new Logger('VersionHelper');

// Returns the app version from package.json, cached for the process lifetime.
export async function getVersionFromPackageJson(): Promise<string> {
  if (cached) return cached;
  const candidates = [
    path.join(process.cwd(), 'package.json'), // pnpm dev
    path.join(__dirname, '../../package.json'), // dist/apps/aa/src/utils -> dist/apps/aa
    path.join(__dirname, '../../../package.json'),
  ];
  for (const p of candidates) {
    try {
      const raw = await fs.readFile(p, 'utf-8');
      const v = (JSON.parse(raw) as any).version as string | undefined;
      if (v) {
        cached = String(v).startsWith('v') ? String(v) : `v${v}`;
        logger.log(`Version loaded ${cached} from ${p}`);
        return cached;
      }
    } catch {
      // candidate path not found, try next
    }
  }
  logger.warn('Version fallback v0.0.0 — package.json not found');
  cached = 'v0.0.0';
  return cached;
}
