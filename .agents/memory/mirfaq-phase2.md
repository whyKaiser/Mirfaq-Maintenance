---
name: Mirfaq Phase 2 Architecture
description: Key decisions for the مِرفق backend and auth integration
---

## DATABASE_URL is runtime-managed
DATABASE_URL is reserved by Replit (PostgreSQL). Do NOT use it for SQLite.
Use `MIRFAQ_DB_URL=file:./dev.db` (set via setEnvVars shared). The Prisma schema uses `env("MIRFAQ_DB_URL")`.

**Why:** Replit blocks writing .env files and reserves DATABASE_URL for its managed PostgreSQL.

## Prisma SQLite path resolution
`file:./dev.db` in schema.prisma resolves relative to the schema file location:
`artifacts/api-server/prisma/schema.prisma` → DB at `artifacts/api-server/prisma/dev.db`.

**Why:** Prisma SQLite paths are always relative to the schema file, not process.cwd().

## API routing
The Replit proxy routes `/api/*` to the api-server (port 8080). The frontend at `/` calls `/api/...` directly — no setBaseUrl needed. The proxy handles routing transparently.

## Session auth flow
- express-session with MemoryStore (resets on restart — acceptable for demo)
- SESSION_SECRET available as Replit secret
- credentials: "include" added to custom-fetch.ts for browser session cookies
- Session augmented via src/types/session.d.ts (userId, userRole, userName, userEmail)

## Frontend auth pattern
- AuthContext wraps the app inside QueryClientProvider
- ProtectedRoute uses useGetMe (retry:false, enabled: !user) for auth check
- On 401, redirects to /login
- Login page fills form from demo account cards, calls useLogin mutation, setUser + navigate

## Orval/Zod version incompatibility
Orval generates `zod.email()` for `format: email` fields — this is Zod v4 syntax.
Project uses Zod v3 which requires `zod.string().email()`.
**Fix:** Remove `format: email` from any OpenAPI string fields in openapi.yaml.

## Dev script includes prisma generate
`"dev": "export NODE_ENV=development && prisma generate && pnpm run build && pnpm run start"`
Ensures Prisma client is always fresh on workflow restart.
