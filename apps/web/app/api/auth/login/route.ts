import { NextResponse } from 'next/server';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { createSession, hashIp, hashToken } from '@/lib/auth';
import { userRequiresMfa } from '@/lib/mfa';
import { jsonError } from '@/lib/http';
import { headers } from 'next/headers';
import { consumeRateLimit, rateLimitHeaders, requestIp } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    const input = schema.parse(await req.json());
    const limit = await consumeRateLimit({scope:'AUTH_LOGIN',identifier:requestIp(req)+'|'+input.email,limit:8,windowMs:5*60_000});
    if(!limit.allowed)return NextResponse.json({error:'Terlalu banyak percobaan login. Coba lagi beberapa saat.'},{status:429,headers:rateLimitHeaders(limit)});
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    const valid = Boolean(user?.passwordHash) && await argon2.verify(user!.passwordHash!, input.password).catch(() => false);
    if (!user || !valid || !user.isActive) {
      return NextResponse.json({ error: 'Email atau password tidak valid' }, { status: 401 });
    }

    const mustUseMfa = user.mfaEnabled || await userRequiresMfa(user.id);
    if (mustUseMfa) {
      const challengeToken = randomBytes(32).toString('base64url');
      const purpose = user.mfaEnabled ? 'LOGIN' : 'ENROLLMENT';
      const ttlSeconds = Number(process.env.MFA_CHALLENGE_TTL_SECONDS || 300);
      await prisma.mfaChallenge.deleteMany({
        where: { userId: user.id, purpose, consumedAt: null },
      });
      await prisma.mfaChallenge.create({
        data: {
          userId: user.id,
          purpose,
          tokenHash: hashToken(challengeToken),
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
      });
      return NextResponse.json({
        error: user.mfaEnabled ? 'MFA_REQUIRED' : 'MFA_ENROLLMENT_REQUIRED',
        challengeToken,
        expiresInSec: ttlSeconds,
      }, { status: 428 });
    }

    await createSession(user.id);
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
    await prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'LOGIN',
        resourceType: 'User',
        resourceId: user.id,
        ipHash: hashIp(ip),
        metadata: { method: 'PASSWORD' },
      },
    });
    return NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, platformRole: user.platformRole },
    });
  } catch (e) {
    return jsonError(e);
  }
}
