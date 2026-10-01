import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { hashToken } from '@/lib/auth';
import { encryptMfaSecret, newMfaSecret, otpauthUri } from '@/lib/mfa';
import { jsonError } from '@/lib/http';

const schema = z.object({ challengeToken: z.string().min(20) });

export async function POST(req: Request) {
  try {
    const { challengeToken } = schema.parse(await req.json());
    const challenge = await prisma.mfaChallenge.findUnique({
      where: { tokenHash: hashToken(challengeToken) },
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

    const secret = newMfaSecret();
    const encrypted = encryptMfaSecret(secret);
    await prisma.mfaCredential.upsert({
      where: { userId: challenge.userId },
      create: { userId: challenge.userId, ...encrypted },
      update: { ...encrypted, enabledAt: null, lastUsedCounter: null },
    });

    return NextResponse.json({
      ok: true,
      secret,
      otpauthUri: otpauthUri(secret, challenge.user.email),
      issuer: 'Leadership That Works',
      digits: 6,
      period: 30,
    });
  } catch (e) {
    return jsonError(e);
  }
}
