import crypto from 'node:crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const email = `ci-auth-${crypto.randomUUID()}@example.local`;
  const password = crypto.randomBytes(24).toString('base64url');
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const user = await prisma.user.create({
    data: { email, name: 'CI Auth Smoke User', passwordHash, isActive: true, emailVerifiedAt: new Date() },
  });
  console.log(`::add-mask::${password}`);
  console.log(`AUTH_SMOKE_USER_ID=${user.id}`);
  console.log(`AUTH_SMOKE_EMAIL=${email}`);
  console.log(`AUTH_SMOKE_PASSWORD=${password}`);
} finally {
  await prisma.$disconnect();
}
