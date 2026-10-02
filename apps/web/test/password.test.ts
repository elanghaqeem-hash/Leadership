import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { hashPassword, verifyPassword } from '../lib/password';

describe('Worker-compatible password hashing', () => {
  it('hashes and verifies a password with WebCrypto PBKDF2', async () => {
    const password = 'Leadership-Demo-2026!';
    const hash = await hashPassword(password);
    expect(hash.split(String.fromCharCode(36))).toHaveLength(4);
    await expect(verifyPassword(hash, password)).resolves.toBe(true);
    await expect(verifyPassword(hash, password + '-wrong')).resolves.toBe(false);
  });

  it('verifies the same serialized format produced by bootstrap scripts', async () => {
    const password = 'Bootstrap-Compatibility-2026!';
    const salt = crypto.randomBytes(16);
    const derived = crypto.pbkdf2Sync(password, salt, 600_000, 32, 'sha256');
    const hash = [
      'pbkdf2-sha256',
      '600000',
      salt.toString('base64url'),
      derived.toString('base64url'),
    ].join(String.fromCharCode(36));

    await expect(verifyPassword(hash, password)).resolves.toBe(true);
  });
});
