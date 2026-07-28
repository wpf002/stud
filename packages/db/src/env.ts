import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

/**
 * Load the workspace-root .env.
 *
 * One .env at the root, read by every workspace package. Per-package env files
 * drift the moment someone changes a port, and a monorepo with five copies of
 * DATABASE_URL is a monorepo with four wrong ones.
 */
export function loadRootEnv(): string | null {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate) && existsSync(join(dir, 'pnpm-workspace.yaml'))) {
      config({ path: candidate });
      return candidate;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
