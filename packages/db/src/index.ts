import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error('DATABASE_URL is required');
  }
  return value;
}

function createPrismaClient(requestScoped = false): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl(),
    connectionTimeoutMillis: 5_000,
    max: requestScoped ? 1 : 10,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/**
 * Executes tenant-scoped work inside one DB transaction and sets a PostgreSQL
 * transaction-local tenant value consumed by RLS policies.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_platform_admin', 'false', true)`;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}

/**
 * Super-admin operations intentionally bypass tenant RLS by using a dedicated
 * role/connection in production. This helper only makes that boundary explicit;
 * do not call it from tenant-scoped handlers.
 */
export async function withPlatformContext<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.is_platform_admin', 'true', true)`;
    return fn(tx);
  });
}

/**
 * Cloudflare Workers must not reuse a connection-backed Prisma client across
 * requests. Node/CI may safely reuse the process-local pool.
 */
export async function withRequestPrisma<T>(
  fn: (db: PrismaClient) => Promise<T>,
): Promise<T> {
  const isCloudflareWorker =
    typeof navigator !== 'undefined' &&
    navigator.userAgent === 'Cloudflare-Workers';

  if (!isCloudflareWorker) {
    return fn(prisma);
  }

  const db = createPrismaClient(true);
  try {
    return await fn(db);
  } finally {
    void db.$disconnect().catch(() => undefined);
  }
}
