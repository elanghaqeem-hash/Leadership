import { describe, expect, it } from 'vitest';
import { base32Encode, generateTotp, verifyTotp } from '../lib/mfa.js';

describe('TOTP MFA', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890', 'ascii'));

  it('matches RFC 6238 SHA1 vector at t=59 for 8 digits', () => {
    expect(generateTotp(secret, 59_000, 8)).toBe('94287082');
  });

  it('matches RFC 6238 SHA1 vector at t=1111111109 for 8 digits', () => {
    expect(generateTotp(secret, 1_111_111_109_000, 8)).toBe('07081804');
  });

  it('accepts a valid 6 digit code and rejects malformed code', () => {
    const now = 1_700_000_000_000;
    const code = generateTotp(secret, now, 6);
    expect(verifyTotp(secret, code, now)).not.toBeNull();
    expect(verifyTotp(secret, '12ab56', now)).toBeNull();
  });
});
