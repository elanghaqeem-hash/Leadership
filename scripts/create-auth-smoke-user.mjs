import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  const email = `ci-auth-${crypto.randomUUID()}@example.local`;
  const password = crypto.randomBytes(24).toString('base64url');
  const salt = crypto.randomBytes(16);
  const derived = crypto.pbkdf2Sync(password, salt, 600_000, 32, 'sha256');
  const passwordHash = ['pbkdf2-sha256', '600000', salt.toString('base64url'), derived.toString('base64url')].join(String.fromCharCode(36));
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
 + salt.toString('base64url') + '
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
 + derived.toString('base64url');
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
