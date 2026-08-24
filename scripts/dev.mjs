#!/usr/bin/env node
/**
 * Dev launcher: pick ports that are actually free, then hand them to turbo.
 *
 *   pnpm dev              # web on the first free port from 3000, api from 4000
 *   WEB_PORT=4500 pnpm dev  # start probing from there instead
 *
 * Why this exists. `next dev -p 3000` dies with EADDRINUSE when anything else
 * holds the port — another project's dev server, or a previous run that did not
 * shut down — and the failure is easy to miss in turbo's interleaved output:
 * the api keeps running, so the stack looks half-up rather than broken.
 *
 * Passing WEB_PORT through the shell did not work either. Turbo 2 runs tasks in
 * strict env mode, so a task only sees variables declared in turbo.json; both
 * port variables were missing from globalEnv and were being stripped before the
 * child ever ran. They are declared now, and this script sets them.
 *
 * The two services have to agree, so whatever ports get chosen are also written
 * into NEXT_PUBLIC_API_URL, NEXT_PUBLIC_WEB_URL and CORS_ORIGINS. Picking ports
 * without doing that would just move the breakage somewhere quieter.
 */
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Minimal .env read, only for the preferred ports. No dependency needed. */
function envFile() {
  const path = join(ROOT, '.env');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return out;
}

function isFree(port) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    // Bind the same way a server would, so a port held on IPv6 counts as taken.
    srv.listen(port, '::');
  });
}

async function freePort(preferred, label) {
  for (let port = preferred; port < preferred + 50; port++) {
    if (await isFree(port)) {
      if (port !== preferred) {
        console.info(`  ${label}: ${preferred} is in use → using ${port}`);
      }
      return port;
    }
  }
  throw new Error(`no free port for ${label} in ${preferred}–${preferred + 49}`);
}

const file = envFile();
const webPreferred = Number(process.env.WEB_PORT ?? file.WEB_PORT ?? 3000);
const apiPreferred = Number(process.env.PORT ?? file.PORT ?? 4000);

const webPort = await freePort(webPreferred, 'web');
const apiPort = await freePort(apiPreferred, 'api');

const webUrl = `http://localhost:${webPort}`;
const apiUrl = `http://localhost:${apiPort}`;
console.info(`\n  web  ${webUrl}\n  api  ${apiUrl}\n`);

const child = spawn('pnpm', ['exec', 'turbo', 'run', 'dev', '--parallel'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: {
    ...process.env,
    WEB_PORT: String(webPort),
    PORT: String(apiPort),
    NEXT_PUBLIC_API_URL: apiUrl,
    NEXT_PUBLIC_WEB_URL: webUrl,
    // The browser only talks to the web origin (/v1 is proxied), but a stale
    // value here would still bite anything calling the api cross-origin.
    CORS_ORIGINS: webUrl,
  },
});

const stop = (sig) => () => child.kill(sig);
process.on('SIGINT', stop('SIGINT'));
process.on('SIGTERM', stop('SIGTERM'));
child.on('exit', (code) => process.exit(code ?? 0));
