import { NextResponse } from 'next/server';
import { withRequestPrisma } from '@ltw/db';
import { createSession, hashToken } from '@/lib/auth';
import { jsonError } from '@/lib/http';

export async function GET(req: Request) {
  return withRequestPrisma(async (db) => {
    try {
      const token = new URL(req.url).searchParams.get('token');
      if (!token) {
        return NextResponse.redirect(new URL('/login?error=magic-link-invalid', req.url));
      }

      const record = await db.magicLinkToken.findUnique({
        where: { tokenHash: hashToken(token) },
        include: { user: true },
      });

      if (
        !record ||
        record.purpose !== 'MANAGER_LOGIN' ||
        record.consumedAt ||
        record.expiresAt <= new Date() ||
        !record.user.isActive
      ) {
        return NextResponse.redirect(new URL('/login?error=magic-link-expired', req.url));
      }

      const updated = await db.magicLinkToken.updateMany({
        where: { id: record.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (updated.count !== 1) {
        return NextResponse.redirect(new URL('/login?error=magic-link-used', req.url));
      }

      await createSession(record.userId, db);
      await db.auditLog.create({
        data: {
          actorUserId: record.userId,
          action: 'LOGIN',
          resourceType: 'User',
          resourceId: record.userId,
          metadata: { method: 'MAGIC_LINK' },
        },
      });

      return NextResponse.redirect(new URL('/dashboard', req.url));
    } catch (error) {
      return jsonError(error);
    }
  }).catch((error) => jsonError(error));
}
