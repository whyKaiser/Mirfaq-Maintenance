---
name: Prisma build approval in pnpm
description: pnpm v10 blocks Prisma build scripts by default; how to allow them
---

## Problem
pnpm v10 blocks native build scripts by default. After installing @prisma/client, prisma, @prisma/engines, they show "Ignored build scripts" warning and the client is not generated.

## Fix
Add to root `package.json`:
```json
{
  "pnpm": {
    "onlyBuiltDependencies": ["@prisma/client", "@prisma/engines", "prisma", "bcrypt", "bcryptjs"]
  }
}
```

**Why:** pnpm 10 introduced `onlyBuiltDependencies` as the allowlist for packages allowed to run postinstall scripts. The interactive `pnpm approve-builds` command can't be used in CI/non-interactive shells.
