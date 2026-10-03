import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function databaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) {
    throw new Error('DATABASE_URL is required at runtime');
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

function processPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient(false);
  }
  return globalForPrisma.prisma;
}

/**
 * Lazy Prisma facade.
 *
 * Next/OpenNext imports API route modules during build-time configuration
 * collection. Creating Prisma eagerly at module import time makes those builds
 * incorrectly require DATABASE_URL. The proxy defers client construction until
 * a route actually executes a database operation.
 */
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = processPrisma();
    const value = Reflect.get(client as object, property, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
}) as PrismaClient;

/**
 * Executes tenant-scoped work inside one DB transaction and sets a PostgreSQL
 * transaction-local tenant value consumed by RLS policies.
 */
export async function withTenantContext<T>(
  tenantId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return processPrisma().$transaction(async (tx) => {
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
  return processPrisma().$transaction(async (tx) => {
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
    return fn(processPrisma());
  }

  const db = createPrismaClient(true);
  try {
    return await fn(db);
  } finally {
    void db.$disconnect().catch(() => undefined);
  }
}
