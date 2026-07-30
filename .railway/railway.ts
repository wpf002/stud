import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";
// NOTE: `generator: "secret(48)"` on a plain service (not a database/
// template) didn't evaluate — it wrote the literal placeholder text as the
// value, which failed the 16-char minimum. AUTH_SECRET was set for real via
// `openssl rand -hex 32 | railway variable set AUTH_SECRET --stdin --service
// api`, and preserve() below means a config apply never touches it again.

/**
 * One Postgres, one API service, one web service — one GitHub source
 * (wpf002/stud), root directory left at the repo root on both app services
 * because this is a pnpm workspace and apps/api / apps/web both need their
 * sibling `packages/*` at build time.
 *
 * Cross-service URLs (CORS_ORIGINS on api; NEXT_PUBLIC_API_URL and
 * NEXT_PUBLIC_WEB_URL on web) are preserve()'d rather than computed here —
 * they need the public domains, which don't exist until after the first
 * apply. Set once via `railway variable set` once domains are generated;
 * preserve() means a later `config apply` never overwrites or deletes them.
 */
export default defineRailway(() => {
  const db = postgres("postgres");

  const api = service("api", {
    // Branch pinned explicitly: without it, Railway's dashboard couldn't
    // verify the source ("GitHub Repo not found" in Settings) even though
    // the repo is public and builds succeeded — reconnecting with an
    // explicit branch fixed it. Pinning it here keeps a future config apply
    // from dropping it back to whatever it inferred the first time.
    source: github("wpf002/stud", { branch: "main" }),
    build: "pnpm run build:api",
    start: "pnpm run start:api",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      // Prisma's schema also wants directUrl (for a pooled DATABASE_URL) —
      // Railway's own Postgres isn't pooled, so both point at the same DB.
      DIRECT_URL: db.env.DATABASE_URL,
      AUTH_SECRET: preserve(),
      VERIFY_LIVE_SOURCES: "false",
      PAYMENTS_PROVIDER: "mock",
      CORS_ORIGINS: preserve(),
    },
  });

  const web = service("web", {
    // Same branch pin as api, same reason.
    source: github("wpf002/stud", { branch: "main" }),
    build: "pnpm run build:web",
    start: "pnpm run start:web",
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_API_URL: preserve(),
      // Build-time origin for canonicals on statically prerendered pages.
      // Must be a LITERAL: a reference like "https://${{RAILWAY_PUBLIC_DOMAIN}}"
      // resolves to nothing during a build, because that variable is injected
      // at runtime only — which left every static canonical falling through to
      // localhost. Anything rendered per request (robots, sitemap, dynamic
      // pages) reads RAILWAY_PUBLIC_DOMAIN first and ignores this, so a domain
      // change self-corrects there without a rebuild; only static pages need
      // this value refreshed, and only on the next deploy.
      SITE_URL: preserve(),
    },
  });

  return project("stud", {
    resources: [db, api, web],
  });
});
