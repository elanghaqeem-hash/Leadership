import { NextResponse } from 'next/server';
import { withRequestPrisma } from '@ltw/db';
import { BUILD_ID } from '@/lib/build-info';

export const dynamic = 'force-dynamic';

export async function GET() {
  const started = Date.now();
  try {
    return await withRequestPrisma(async (db) => {
      await db.$queryRaw`SELECT 1`;
      const published = await db.programVersion.count({
        where: { status: 'PUBLISHED', program: { code: 'LTW', isTemplate: true } },
      });
      const ready = published > 0;
      return NextResponse.json(
        {
          ok: ready,
          service: 'leadership-that-works',
          buildId: BUILD_ID,
          checks: { database: 'UP', programSeed: ready ? 'READY' : 'MISSING' },
          latencyMs: Date.now() - started,
          timestamp: new Date().toISOString(),
        },
        { status: ready ? 200 : 503, headers: { 'cache-control': 'no-store' } },
      );
    });
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: 'leadership-that-works',
        buildId: BUILD_ID,
        checks: { database: 'DOWN', programSeed: 'UNKNOWN' },
        latencyMs: Date.now() - started,
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
