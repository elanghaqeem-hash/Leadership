import { NextResponse } from 'next/server';
import { withRequestPrisma } from '@ltw/db';
import { getCurrentUser, revokeCurrentSession } from '@/lib/auth';
import { jsonError } from '@/lib/http';

export async function POST() {
  return withRequestPrisma(async (db) => {
    try {
      const user = await getCurrentUser(db);
      await revokeCurrentSession(db);
      if (user) {
        await db.auditLog.create({
          data: {
            actorUserId: user.id,
            action: 'LOGOUT',
            resourceType: 'User',
            resourceId: user.id,
          },
        });
      }
      return NextResponse.json({ ok: true });
    } catch (error) {
      return jsonError(error);
    }
  }).catch((error) => jsonError(error));
}
