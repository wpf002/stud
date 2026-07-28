#!/usr/bin/env bash
# Stud — infrastructure bootstrap.
#
# Takes a clean checkout to `pnpm dev` booting web + studio + api against a
# seeded Postgres. Idempotent: safe to run repeatedly.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

bold() { printf '\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$1" >&2; exit 1; }

bold "Stud bootstrap"

# ── 1. Toolchain ────────────────────────────────────────────────────────────
command -v node >/dev/null || die "Node.js not found. Install Node >= 20.11."
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || die "Node $NODE_MAJOR is too old. Need >= 20.11."
ok "node $(node -v)"

if ! command -v pnpm >/dev/null; then
  warn "pnpm not found — enabling via corepack"
  corepack enable >/dev/null 2>&1 || die "Could not enable corepack. Install pnpm manually."
fi
ok "pnpm $(pnpm -v)"

# ── 2. Environment ──────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  if command -v openssl >/dev/null; then
    SECRET="$(openssl rand -base64 32)"
    # BSD and GNU sed disagree on -i; write through a temp file instead.
    awk -v s="$SECRET" '/^AUTH_SECRET=/ {print "AUTH_SECRET=\"" s "\""; next} {print}' .env > .env.tmp
    mv .env.tmp .env
    ok "generated .env with a fresh AUTH_SECRET"
  else
    warn ".env created — set AUTH_SECRET yourself (openssl not found)"
  fi
else
  ok ".env already present"
fi

# ── 3. Postgres ─────────────────────────────────────────────────────────────
# Developer machines accumulate Postgres containers. Take the first free port
# from 5438 up rather than colliding with whatever else is running.
port_free() { ! (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
container_exists() { [ -n "$(docker ps -aq -f "name=^stud-postgres$" 2>/dev/null || true)" ]; }
container_running() { [ -n "$(docker ps -q -f "name=^stud-postgres$" 2>/dev/null || true)" ]; }
published_port() {
  docker inspect -f '{{(index (index .NetworkSettings.Ports "5432/tcp") 0).HostPort}}' \
    stud-postgres 2>/dev/null || true
}

PG_PORT="${STUD_PG_PORT:-}"
HAVE_DOCKER=0
command -v docker >/dev/null && docker info >/dev/null 2>&1 && HAVE_DOCKER=1

if [ "$HAVE_DOCKER" = "1" ]; then
  if container_exists; then
    EXISTING_PORT="$(published_port)"
    if container_running; then
      PG_PORT="${PG_PORT:-$EXISTING_PORT}"
    elif [ -n "$EXISTING_PORT" ] && port_free "$EXISTING_PORT"; then
      docker start stud-postgres >/dev/null
      PG_PORT="${PG_PORT:-$EXISTING_PORT}"
      ok "restarted stud-postgres on :${EXISTING_PORT}"
    else
      # Container is stopped and its old port is taken by something else.
      # The data volume survives; recreate the container against a free port.
      warn "port ${EXISTING_PORT:-unknown} is in use — recreating the container"
      docker rm -f stud-postgres >/dev/null 2>&1 || true
    fi
  fi
fi

if [ -z "$PG_PORT" ]; then
  PG_PORT=5438
  while ! port_free "$PG_PORT"; do PG_PORT=$((PG_PORT + 1)); done
fi

# Keep .env pointing at whatever port we actually landed on.
awk -v p="$PG_PORT" '
  /^DATABASE_URL=/        {print "DATABASE_URL=\"postgresql://stud:stud@localhost:" p "/stud?schema=public\""; next}
  /^DIRECT_URL=/          {print "DIRECT_URL=\"postgresql://stud:stud@localhost:" p "/stud?schema=public\""; next}
  /^SHADOW_DATABASE_URL=/ {print "SHADOW_DATABASE_URL=\"postgresql://stud:stud@localhost:" p "/stud_shadow?schema=public\""; next}
  {print}
' .env > .env.tmp && mv .env.tmp .env
ok "database on port ${PG_PORT}"

# ── 3b. Service ports ───────────────────────────────────────────────────────
# Same problem, different services. Claim free ports and write them into .env
# so the browser-facing NEXT_PUBLIC_* values can never drift from the API.
pick_port() { local p="$1"; while ! port_free "$p"; do p=$((p + 1)); done; echo "$p"; }

API_PORT="$(pick_port "${STUD_API_PORT:-4000}")"
WEB_PORT="$(pick_port "${STUD_WEB_PORT:-3000}")"
STUDIO_PORT="$(pick_port "${STUD_STUDIO_PORT:-$((WEB_PORT + 1))}")"

awk -v api="$API_PORT" -v web="$WEB_PORT" -v studio="$STUDIO_PORT" '
  /^PORT=/                   {print "PORT=" api; next}
  /^WEB_PORT=/               {print "WEB_PORT=" web; next}
  /^STUDIO_PORT=/            {print "STUDIO_PORT=" studio; next}
  /^CORS_ORIGINS=/           {print "CORS_ORIGINS=\"http://localhost:" web ",http://localhost:" studio "\""; next}
  /^NEXT_PUBLIC_API_URL=/    {print "NEXT_PUBLIC_API_URL=\"http://localhost:" api "\""; next}
  /^NEXT_PUBLIC_WEB_URL=/    {print "NEXT_PUBLIC_WEB_URL=\"http://localhost:" web "\""; next}
  /^NEXT_PUBLIC_STUDIO_URL=/ {print "NEXT_PUBLIC_STUDIO_URL=\"http://localhost:" studio "\""; next}
  {print}
' .env > .env.tmp && mv .env.tmp .env
ok "api :${API_PORT} · web :${WEB_PORT} · studio :${STUDIO_PORT}"

if [ "$HAVE_DOCKER" = "1" ]; then
  if container_running; then
    ok "stud-postgres already running"
  else
    docker run -d --name stud-postgres \
      -e POSTGRES_USER=stud -e POSTGRES_PASSWORD=stud -e POSTGRES_DB=stud \
      -p "${PG_PORT}":5432 \
      -v stud-pgdata:/var/lib/postgresql/data \
      postgres:16-alpine >/dev/null
    ok "created stud-postgres on :${PG_PORT}"
  fi

  printf '  … waiting for Postgres'
  for _ in $(seq 1 45); do
    if docker exec stud-postgres pg_isready -U stud >/dev/null 2>&1; then
      printf '\r'; ok "Postgres accepting connections            "
      break
    fi
    printf '.'; sleep 1
  done
  docker exec stud-postgres psql -U stud -d stud -tc \
    "SELECT 1 FROM pg_database WHERE datname='stud_shadow'" 2>/dev/null | grep -q 1 \
    || docker exec stud-postgres createdb -U stud stud_shadow >/dev/null 2>&1 || true
else
  warn "Docker unavailable — point DATABASE_URL at your own Postgres 15+"
fi

# ── 4. Dependencies ─────────────────────────────────────────────────────────
bold "Installing dependencies"
pnpm install --frozen-lockfile 2>/dev/null || pnpm install
ok "workspace installed"

# ── 5. Database ─────────────────────────────────────────────────────────────
bold "Preparing the database"
pnpm --filter @stud/db generate
ok "prisma client generated"

if pnpm --filter @stud/db migrate:deploy 2>/dev/null; then
  ok "migrations applied"
else
  warn "migrate deploy failed — run 'pnpm db:migrate' once Postgres is reachable"
fi

if [ "${SKIP_SEED:-0}" != "1" ]; then
  pnpm --filter @stud/db seed && ok "seeded" || warn "seed skipped"
fi

# ── 6. Done ─────────────────────────────────────────────────────────────────
printf '\n'
bold "Ready."
cat <<'EOF'

  pnpm dev            ports are written into .env by this script
  pnpm db:studio      Prisma Studio
  pnpm test           run the test suites

  Seeded logins (password: studdev1234)
    breeder@stud.dev   BREEDER + OWNER, Blackwater Kennels
    buyer@stud.dev     BUYER
    admin@stud.dev     ADMIN

EOF
