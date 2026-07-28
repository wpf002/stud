import { loadRootEnv } from '@stud/db/env';
import { z } from 'zod';

loadRootEnv();

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  /** Comma-separated list of allowed browser origins. */
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3001'),
  COOKIE_DOMAIN: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().default(30),
  LOG_LEVEL: z.string().default('info'),

  // ── Verification (Phase 2) ────────────────────────────────────────────────
  // Off by default. Contacting third-party public-record sites is gated on the
  // terms-of-use review in docs/verification-sources.md. With this false, the
  // fixture adapter serves the same contract offline.
  VERIFY_LIVE_SOURCES: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),
  VERIFY_USER_AGENT: z.string().default('StudVerify/0.1 (+https://stud.dog/verification)'),
  VERIFY_REQUEST_TIMEOUT_MS: z.coerce.number().default(8000),
  VERIFY_FRESHNESS_DAYS: z.coerce.number().default(30),

  // ── Payments (Phase 5/7) ──────────────────────────────────────────────────
  // `mock` is the ONLY supported value until a processor has approved live
  // animal sales in writing. See docs/payments-diligence.md.
  PAYMENTS_PROVIDER: z.string().default('mock'),
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(10_000).default(600),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  · ${i.path.join('.')}: ${i.message}`).join('\n');
  throw new Error(`Invalid environment.\n${issues}\n\nCopy .env.example to .env and fill it in.`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const corsOrigins = env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean);
