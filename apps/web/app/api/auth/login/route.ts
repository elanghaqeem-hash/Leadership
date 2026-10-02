import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { withRequestPrisma } from '@ltw/db';
import { createSession, hashIp, hashToken } from '@/lib/auth';
import { userRequiresMfa } from '@/lib/mfa';
import { jsonError } from '@/lib/http';
import { hashPassword, isCurrentPasswordHash, verifyPassword } from '@/lib/password';
import { headers } from 'next/headers';
import { consumeRateLimit, rateLimitHeaders, requestIp } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  return withRequestPrisma(async (db) => {
    try {
      const input = schema.parse(await req.json());
      const limit = await consumeRateLimit(
        {
          scope: 'AUTH_LOGIN',
          identifier: requestIp(req) + '|' + input.email,
          limit: 8,
          windowMs: 5 * 60_000,
        },
        db,
      );
      if (!limit.allowed) {
        return NextResponse.json(
          { error: 'Terlalu banyak percobaan login. Coba lagi beberapa saat.' },
          { status: 429, headers: rateLimitHeaders(limit) },
        );
      }

      let user = await db.user.findUnique({ where: { email: input.email } });

      // Optional first-login bootstrap. Credentials live only in Worker secrets.
      const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
      const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
      const bootstrapName = process.env.BOOTSTRAP_ADMIN_NAME || 'Platform Administrator';
      const isBootstrapAttempt = Boolean(
        bootstrapEmail &&
        bootstrapPassword &&
        input.email === bootstrapEmail &&
        input.password === bootstrapPassword,
      );

      if (!user && isBootstrapAttempt) {
        const passwordHash = await hashPassword(input.password);
        user = await db.user.create({
          data: {
            email: input.email,
            name: bootstrapName,
            platformRole: 'SUPER_ADMIN',
            passwordHash,
            emailVerifiedAt: new Date(),
            isActive: true,
          },
        });
      }

      let valid = Boolean(user?.passwordHash) && await verifyPassword(user?.passwordHash, input.password);

      // Transparently migrate an existing bootstrap admin away from native Argon2.
      if (
        user &&
        isBootstrapAttempt &&
        user.platformRole === 'SUPER_ADMIN' &&
        (!valid || !isCurrentPasswordHash(user.passwordHash))
      ) {
        const passwordHash = await hashPassword(input.password);
        user = await db.user.update({
          where: { id: user.id },
          data: { passwordHash, isActive: true, emailVerifiedAt: user.emailVerifiedAt ?? new Date() },
        });
        valid = true;
      }

      if (!user || !valid || !user.isActive) {
        return NextResponse.json({ error: 'Email atau password tidak valid' }, { status: 401 });
      }

      const mustUseMfa = user.mfaEnabled || await userRequiresMfa(user.id, db);
      if (mustUseMfa) {
        const challengeToken = randomBytes(32).toString('base64url');
        const purpose = user.mfaEnabled ? 'LOGIN' : 'ENROLLMENT';
        const ttlSeconds = Number(process.env.MFA_CHALLENGE_TTL_SECONDS || 300);
        await db.mfaChallenge.deleteMany({
          where: { userId: user.id, purpose, consumedAt: null },
        });
        await db.mfaChallenge.create({
          data: {
            userId: user.id,
            purpose,
            tokenHash: hashToken(challengeToken),
            expiresAt: new Date(Date.now() + ttlSeconds * 1000),
          },
        });
        return NextResponse.json(
          {
            error: user.mfaEnabled ? 'MFA_REQUIRED' : 'MFA_ENROLLMENT_REQUIRED',
            challengeToken,
            expiresInSec: ttlSeconds,
          },
          { status: 428 },
        );
      }

      await createSession(user.id, db);
      const h = await headers();
      const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip');
      await db.auditLog.create({
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
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          platformRole: user.platformRole,
        },
      });
    } catch (error) {
      return jsonError(error);
    }
  }).catch((error) => jsonError(error));
}
