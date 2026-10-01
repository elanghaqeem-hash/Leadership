import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { AuthError, createSession, hashIp, hashToken } from '@/lib/auth';
import { decryptMfaSecret, verifyTotp } from '@/lib/mfa';
import { jsonError } from '@/lib/http';
import { headers } from 'next/headers';

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
      challenge.purpose !== 'LOGIN' ||
      challenge.consumedAt ||
      challenge.expiresAt <= new Date() ||
      !challenge.user.isActive ||
      !challenge.user.mfaEnabled
    ) {
      return NextResponse.json({ error: 'MFA_CHALLENGE_INVALID' }, { status: 400 });
    }

    const credential = await prisma.mfaCredential.findUnique({ where: { userId: challenge.userId } });
    if (!credential?.enabledAt) return NextResponse.json({ error: 'MFA_SETUP_REQUIRED' }, { status: 400 });

    const counter = verifyTotp(decryptMfaSecret(credential), input.code);
    if (counter === null) return NextResponse.json({ error: 'MFA_CODE_INVALID' }, { status: 401 });

    await prisma.$transaction(async (tx) => {
      const consumed = await tx.mfaChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (consumed.count !== 1) throw new AuthError('MFA_CHALLENGE_USED', 409);
      const replayGuard = await tx.mfaCredential.updateMany({
        where: {
          id: credential.id,
          enabledAt: { not: null },
          OR: [{ lastUsedCounter: null }, { lastUsedCounter: { lt: counter } }],
        },
        data: { lastUsedCounter: counter },
      });
      if (replayGuard.count !== 1) throw new AuthError('MFA_CODE_REPLAYED', 409);
    });

    await createSession(challenge.userId);
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
    await prisma.auditLog.create({
      data: {
        actorUserId: challenge.userId,
        action: 'LOGIN',
        resourceType: 'User',
        resourceId: challenge.userId,
        ipHash: hashIp(ip),
        metadata: { method: 'PASSWORD_TOTP' },
      },
    });
    return NextResponse.json({
      ok: true,
      user: {
        id: challenge.user.id,
        email: challenge.user.email,
        name: challenge.user.name,
        platformRole: challenge.user.platformRole,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
