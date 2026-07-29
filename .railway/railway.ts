import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

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
    source: github("wpf002/stud"),
    build: "pnpm run build:api",
    start: "pnpm run start:api",
    env: {
      NODE_ENV: "production",
      DATABASE_URL: db.env.DATABASE_URL,
      // A real session-signing secret, generated server-side — never a
      // value this script could compute or see.
      AUTH_SECRET: { generator: "secret(48)" },
      VERIFY_LIVE_SOURCES: "false",
      PAYMENTS_PROVIDER: "mock",
      CORS_ORIGINS: preserve(),
    },
  });

  const web = service("web", {
    source: github("wpf002/stud"),
    build: "pnpm run build:web",
    start: "pnpm run start:web",
    env: {
      NODE_ENV: "production",
      NEXT_PUBLIC_API_URL: preserve(),
      NEXT_PUBLIC_WEB_URL: preserve(),
    },
  });

  return project("stud", {
    resources: [db, api, web],
  });
});
