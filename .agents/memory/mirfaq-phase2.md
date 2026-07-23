---
name: Mirfaq Phase 2 & 3 Architecture
description: Key decisions for the مِرفق SaaS — DB, auth, API, multi-tenancy, uploads, print pages
---

## DB
- SQLite via `MIRFAQ_DB_URL=file:./dev.db` (Replit reserves `DATABASE_URL` for Postgres — never use it)
- Prisma 6, schema at `artifacts/api-server/prisma/schema.prisma`
- Seed: `cd artifacts/api-server && pnpm db:seed` — demo org `"org-demo"`, password `Demo123!`
- Reset: `rm -rf prisma/migrations prisma/dev.db && npx prisma migrate dev --name <name>`

## Auth / Session
- express-session (MemoryStore), 7-day TTL
- Session fields: `userId`, `userRole`, `organizationId`, `organizationName`
- `credentials: "include"` in `lib/api-client-react/src/custom-fetch.ts` for cross-origin cookies
- Inactive users rejected at login; existing sessions survive until expiry

## API contract
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- Orval regeneration: `cd lib/api-spec && pnpm exec orval`
- Generated hooks: `lib/api-client-react/src/generated/api.ts`

## Multi-tenancy (Phase 3)
- Every query scoped by `req.session.organizationId` — never cross-org leakage
- `ExtAuthUser = AuthUser & { organizationName: string; brandColor: string }` in AuthContext
- Generated `AuthUser` now includes `organizationId`, `organizationName?`, `brandColor?` (after Orval regen)
- Cast in login.tsx: `setUser(user as ExtAuthUser)` is safe — backend always returns these fields

## File uploads
- multer installed; JPEG/PNG/WebP only, 3 MB max, 3 files max per upload
- `UPLOAD_DIR` in `artifacts/api-server/src/lib/storage.ts`
- Routes: `POST /api/requests/:id/attachments`, `DELETE /api/attachments/:id`, `GET /api/files/:filename`
- `attachmentType`: `"initial"` (resident on submit) or `"completion"` (technician on complete)

## Print pages
- `GET /api/reports/work-order/:id` → `print-work-order.tsx` (auto-triggers window.print after 600ms)
- `GET /api/reports/monthly?year&month` → `print-monthly.tsx` (landscape A4)
- Both pages require active session cookie — opened in new tab from manager dashboard

## Manager dashboard (Phase 3 nav)
- 8 nav items: dashboard, properties, units, requests, technicians, users, audit, settings
- Sidebar header uses `user.brandColor` as background
- Print button on each request row → `/print/work-order/:id`
- Monthly report button in RequestsView header

## Routing
- Replit proxy: `/api/*` → port 8080 (api-server), `/` → port 23085 (frontend/mirfaq)
- Print pages registered in `App.tsx` at `/print/work-order/:requestId` and `/print/monthly`

**Why:** MIRFAQ_DB_URL avoids Replit's Postgres reservation; credentials:include is required because the Vite dev server and API run on different ports in development.
