# Project Structure

Recommended architecture: pnpm monorepo, with one Next.js application and isolated domain packages. This keeps the scoring and authorization rules usable by server routes, background jobs, tests, export workers, and a future on-prem deployment without coupling them to React.

```text
leadership-that-works/
├─ apps/
│  └─ web/
│     ├─ src/app/
│     │  ├─ (auth)/
│     │  ├─ (participant)/
│     │  ├─ (trainer)/
│     │  ├─ (observer)/
│     │  ├─ (manager)/
│     │  ├─ (admin)/
│     │  ├─ (sponsor)/
│     │  └─ api/
│     ├─ src/components/
│     ├─ src/lib/server/
│     └─ src/lib/client/
├─ packages/
│  ├─ db/                 # Prisma client, tenant context, repositories
│  ├─ authz/              # server-side RBAC/ABAC policy engine
│  ├─ scoring/            # pure scoring functions only
│  ├─ contracts/          # zod schemas / DTOs / event contracts
│  ├─ content/            # content import, versioning, seed adapters
│  ├─ realtime/           # pub/sub contracts, presence, session events
│  ├─ notifications/      # email + WhatsApp-ready webhook adapters
│  ├─ exports/            # ExcelJS/PDF builders
│  ├─ ui/                 # design system, accessible components
│  └─ observability/      # structured logs, tracing, metrics
├─ workers/
│  ├─ reminders/          # D7/D14/D30 scheduler
│  └─ exports/            # heavy async XLSX/PDF generation
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed/
├─ tests/
│  ├─ integration/        # RLS, cross-tenant, API authz, exports
│  ├─ e2e/                # Playwright mobile 375px flows
│  ├─ load/               # 30 participant realtime target
│  └─ parity/             # Excel golden fixtures when workbook is supplied
├─ infra/
│  ├─ docker/
│  ├─ compose/
│  └─ env/
└─ docs/
   ├─ rbac-matrix.md
   ├─ data-classification.md
   ├─ threat-model.md
   └─ runbooks/
```

## Architectural boundaries

`scoring/` cannot import database, clock, network, React, or environment variables. Dates such as “today” are passed as function inputs so tests are deterministic. `authz/` cannot trust client-provided role/tenant identifiers; it resolves them from authenticated server context and persisted memberships. `realtime/` transports state changes but never decides authorization. Every subscription is authorized before joining a tenant/batch channel.

Offline support should use an IndexedDB outbox with idempotency keys and server conflict/version checks. The client caches only the minimum activity payload required for the current batch; answer keys and privileged content are never preloaded before Reveal.
