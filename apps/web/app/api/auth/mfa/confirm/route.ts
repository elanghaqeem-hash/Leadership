import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { AuthError, createSession, hashToken } from '@/lib/auth';
import { decryptMfaSecret, verifyTotp } from '@/lib/mfa';
import { jsonError } from '@/lib/http';

const schema = z.object({
  challengeToken: z.string().min(20),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(req: Request) {
  try {
    const input = schema.parse(await req.json());
    const challenge = await prisma.mfaChallenge.findUnique({
      where: { tokenHash: hashToken(input.challengeToken) },
      include: { user: true },
    });
    if (
      !challenge ||
      challenge.purpose !== 'ENROLLMENT' ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      !challenge.user.isActive
    ) {
      return NextResponse.json({ error: 'MFA_CHALLENGE_INVALID' }, { status: 400 });
    }

    const credential = await prisma.mfaCredential.findUnique({ where: { userId: challenge.userId } });
    if (!credential) return NextResponse.json({ error: 'MFA_SETUP_REQUIRED' }, { status: 400 });

    const counter = verifyTotp(decryptMfaSecret(credential), input.code);
    if (counter === null) return NextResponse.json({ error: 'MFA_CODE_INVALID' }, { status: 401 });

    const committed = await prisma.$transaction(async (tx) => {
      const consumed = await tx.mfaChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) return false;
      await tx.mfaCredential.update({
        where: { id: credential.id },
        data: { enabledAt: new Date(), lastUsedCounter: counter },
      });
      await tx.user.update({ where: { id: challenge.userId }, data: { mfaEnabled: true } });
      await tx.auditLog.create({
        data: {
          actorUserId: challenge.userId,
          action: 'UPDATE',
          resourceType: 'MFA',
          resourceId: credential.id,
          metadata: { event: 'MFA_ENROLLED', method: 'TOTP' },
        },
      });
      return true;
    });
    if (!committed) throw new AuthError('MFA_CHALLENGE_USED', 409);

    await createSession(challenge.userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
