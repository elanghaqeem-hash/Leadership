import { Prisma, PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Executes tenant-scoped work inside one DB transaction and sets a PostgreSQL
 * transaction-local tenant value consumed by RLS policies.
 */
export async function withTenantContext<T>(tenantId: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_platform_admin', 'false', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

/** Super-admin operations intentionally bypass tenant RLS by using a dedicated
 * role/connection in production. This helper only makes that boundary explicit;
 * do not call it from tenant-scoped handlers. */
export async function withPlatformContext<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', true)`;
    return fn(tx);
  });
}



/**
 * Cloudflare Workers must not reuse a pooled Prisma socket across requests.
 * Use this helper for request-bound routes and disconnect before returning.
 */
export async function withRequestPrisma<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const isCloudflareWorker =
    typeof navigator !== 'undefined' &&
    navigator.userAgent === 'Cloudflare-Workers';

  // A conventional Node server can safely reuse its process-local Prisma pool.
  // Cloudflare Workers must not reuse a socket-backed Prisma client across requests.
  if (!isCloudflareWorker) {
    return fn(prisma);
  }

  const db = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  try {
    return await fn(db);
  } finally {
    // Start cleanup immediately without holding the HTTP response open.
    void db.$disconnect().catch(() => undefined);
  }
}
