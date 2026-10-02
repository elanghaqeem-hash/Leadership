import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes } from 'node:crypto';
import { prisma } from '@ltw/db';
import type { PrismaClient } from '@prisma/client';

const STEP_SECONDS = 30;
const DIGITS = 6;

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const normalized = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of normalized) {
    const idx = alphabet.indexOf(char);
    if (idx < 0) throw new Error('Invalid base32 secret');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function totpCode(secret: string, counter: bigint, digits = DIGITS): string {
  const key = base32Decode(secret);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(counter);
  const digest = createHmac('sha1', key).update(msg).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function generateTotp(secret: string, atMs = Date.now(), digits = DIGITS): string {
  const counter = BigInt(Math.floor(atMs / 1000 / STEP_SECONDS));
  return totpCode(secret, counter, digits);
}

export function verifyTotp(secret: string, code: string, atMs = Date.now(), window = 1): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const current = BigInt(Math.floor(atMs / 1000 / STEP_SECONDS));
  for (let delta = -window; delta <= window; delta += 1) {
    const counter = current + BigInt(delta);
    if (counter < BigInt(0)) continue;
    if (totpCode(secret, counter, 6) === code) return counter;
  }
  return null;
}

function encryptionKey(): Buffer {
  const raw = process.env.MFA_ENCRYPTION_KEY || process.env.APP_SECRET;
  if (!raw || raw.length < 32) throw new Error('MFA_ENCRYPTION_KEY or APP_SECRET must be at least 32 characters');
  return createHash('sha256').update(raw).digest();
}

export function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encryptedSecret: encrypted.toString('base64url'),
    iv: iv.toString('base64url'),
    authTag: authTag.toString('base64url'),
  };
}

export function decryptMfaSecret(input: { encryptedSecret: string; iv: string; authTag: string }): string {
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(input.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(input.authTag, 'base64url'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(input.encryptedSecret, 'base64url')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function newMfaSecret(): string {
  return base32Encode(randomBytes(20));
}

export function otpauthUri(secret: string, email: string, issuer = 'Leadership That Works'): string {
  const label = encodeURIComponent(`${issuer}:${email}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params.toString()}`;
}

export async function userRequiresMfa(userId: string, db: PrismaClient = prisma): Promise<boolean> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      platformRole: true,
      tenantMemberships: { where: { role: 'PROGRAM_ADMIN' }, select: { id: true }, take: 1 },
      batchMemberships: {
        where: { role: { in: ['PROGRAM_ADMIN', 'LEAD_TRAINER'] }, isActive: true },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user) return false;
  return user.platformRole === 'SUPER_ADMIN' || user.tenantMemberships.length > 0 || user.batchMemberships.length > 0;
}
