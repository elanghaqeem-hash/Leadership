import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { withRequestPrisma } from '@ltw/db';
import { hashToken } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { sendAccountNotification } from '@/lib/notifications';
import { consumeRateLimit, rateLimitHeaders, requestIp } from '@/lib/rate-limit';

const schema = z.object({
  email: z.string().email().transform((value) => value.toLowerCase()),
});

export async function POST(req: Request) {
  try {
    const { email } = schema.parse(await req.json());

    const prepared = await withRequestPrisma(async (db) => {
      const limit = await consumeRateLimit(
        {
          scope: 'MANAGER_MAGIC_LINK',
          identifier: requestIp(req) + '|' + email,
          limit: 5,
          windowMs: 15 * 60_000,
        },
        db,
      );

      if (!limit.allowed) {
        return {
          response: NextResponse.json(
            { error: 'Terlalu banyak permintaan. Coba lagi nanti.' },
            { status: 429, headers: rateLimitHeaders(limit) },
          ),
          notification: null,
          devMagicLink: undefined as string | undefined,
        };
      }

      const user = await db.user.findUnique({
        where: { email },
        include: {
          batchMemberships: {
            where: { role: 'LINE_MANAGER', isActive: true },
            take: 1,
          },
        },
      });

      if (!user || !user.isActive || user.batchMemberships.length === 0) {
        return {
          response: null,
          notification: null,
          devMagicLink: undefined as string | undefined,
        };
      }

      const token = randomBytes(32).toString('base64url');
      const ttl = Number(process.env.MAGIC_LINK_TTL_MINUTES || 20);
      const expiresAt = new Date(Date.now() + ttl * 60_000);

      await db.magicLinkToken.create({
        data: {
          userId: user.id,
          purpose: 'MANAGER_LOGIN',
          tokenHash: hashToken(token),
          expiresAt,
        },
      });

      const base = process.env.APP_URL || 'http://localhost:3000';
      const link = `${base}/api/auth/magic-link/consume?token=${encodeURIComponent(token)}`;

      return {
        response: null,
        notification: {
          event: 'MANAGER_MAGIC_LINK' as const,
          recipient: {
            userId: user.id,
            name: user.name,
            email: user.email,
            role: 'LINE_MANAGER',
          },
          link,
          expiresAt: expiresAt.toISOString(),
        },
        devMagicLink: process.env.NODE_ENV !== 'production' ? link : undefined,
      };
    });

    if (prepared.response) return prepared.response;
    if (prepared.notification) {
      await sendAccountNotification(prepared.notification);
    }

    return NextResponse.json({
      ok: true,
      message: 'Jika email terdaftar sebagai Line Manager, tautan login akan dikirim.',
      ...(prepared.devMagicLink ? { devMagicLink: prepared.devMagicLink } : {}),
    });
  } catch (error) {
    return jsonError(error);
  }
}
