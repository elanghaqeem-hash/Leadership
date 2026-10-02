import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withRequestPrisma } from '@ltw/db';
import { createSession, hashToken } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { hashPassword } from '@/lib/password';

const schema = z.object({
  token: z.string().min(20),
  password: z.string().min(12).max(200),
  consent: z.literal(true),
});

export async function POST(req: Request) {
  return withRequestPrisma(async (db) => {
    try {
      const input = schema.parse(await req.json());
      const token = await db.magicLinkToken.findUnique({
        where: { tokenHash: hashToken(input.token) },
        include: { user: true },
      });
      if (
        !token ||
        token.purpose !== 'ACCOUNT_ACTIVATION' ||
        token.consumedAt ||
        token.expiresAt <= new Date() ||
        !token.user.isActive
      ) {
        return NextResponse.json(
          { error: 'Tautan aktivasi tidak valid atau telah kedaluwarsa' },
          { status: 400 },
        );
      }

      const passwordHash = await hashPassword(input.password);
      const updated = await db.$transaction(async (tx) => {
        const consumed = await tx.magicLinkToken.updateMany({
          where: { id: token.id, consumedAt: null },
          data: { consumedAt: new Date() },
        });
        if (consumed.count !== 1) return false;
        await tx.user.update({
          where: { id: token.userId },
          data: { passwordHash, emailVerifiedAt: new Date() },
        });
        await tx.tenantMembership.updateMany({
          where: { userId: token.userId, activatedAt: null },
          data: { activatedAt: new Date() },
        });
        await tx.consentRecord.create({
          data: { userId: token.userId, version: 'privacy-v1' },
        });
        await tx.auditLog.create({
          data: {
            actorUserId: token.userId,
            action: 'CONSENT_ACCEPTED',
            resourceType: 'User',
            resourceId: token.userId,
            metadata: { version: 'privacy-v1' },
          },
        });
        return true;
      });

      if (!updated) {
        return NextResponse.json({ error: 'Tautan aktivasi sudah digunakan' }, { status: 409 });
      }
      await createSession(token.userId, db);
      return NextResponse.json({ ok: true });
    } catch (error) {
      return jsonError(error);
    }
  }).catch((error) => jsonError(error));
}
