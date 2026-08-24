#!/usr/bin/env node
/**
 * Stop this repo's dev stack, and only this repo's.
 *
 *   pnpm dev:stop
 *
 * Reads the pid recorded by scripts/dev.mjs. A pattern kill would be wrong
 * here: `pkill -f "next dev"` matches any project's Next server, which is how
 * an unrelated repo's dev server got taken out from this one.
 */
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const STATE = join(dirname(fileURLToPath(import.meta.url)), '..', '.dev-state.json');
if (!existsSync(STATE)) {
  console.info('nothing recorded as running');
  process.exit(0);
}
const { pid, webUrl, apiUrl } = JSON.parse(readFileSync(STATE, 'utf8'));
try {
  process.kill(pid, 'SIGTERM');
  console.info(`stopped dev (pid ${pid}) — was serving ${webUrl} and ${apiUrl}`);
} catch {
  console.info(`pid ${pid} was not running; clearing stale state`);
}
rmSync(STATE, { force: true });
