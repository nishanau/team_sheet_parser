# Project Instructions

## Commands

```bash
# Build
npm run build

# Lint
npm run lint             # check style

# Dev
npm run dev              # start dev server

# Database
npm run db:generate      # generate migrations from schema changes
npm run db:migrate       # apply pending migrations
```

## Architecture

- `app/` — Next.js App Router pages and React components
- `app/api/` — API route handlers (Next.js Route Handlers)
- `db/schema.ts` — Drizzle ORM schema definitions
- `db/migrations/` — generated SQL migrations (do not edit manually)

## Key Decisions

## Domain Knowledge

## Workflow

- Prefer fixing the root cause over adding workarounds
- When unsure about approach, use plan mode (`Shift+Tab`) before coding

## Don'ts

- Don't modify generated files in `db/migrations/` manually
