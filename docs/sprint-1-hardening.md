# Sprint 1.1 Hardening

This hardening layer sits on top of Sprint 1 Auth/RBAC/Tenant/Batch/Participant Import.

## MFA policy

TOTP MFA is mandatory at password login for:

- Super Admin
- Program Admin (tenant or batch)
- Lead Trainer

Standard participants and Line Managers do not require TOTP by default. Line Managers may use the restricted magic-link login flow.

TOTP secrets are encrypted with AES-256-GCM using a server-only encryption key derived from `MFA_ENCRYPTION_KEY` (or `APP_SECRET` only as a fallback). The database stores ciphertext, IV, and authentication tag, never the plaintext TOTP secret.

Login challenges are short-lived, opaque, stored only as SHA-256 hashes, and single-use. The last accepted TOTP counter is stored to reject same-step replay across multiple login challenges.

## Tenant isolation

Application authorization and PostgreSQL RLS are independent controls.

- API handlers enforce server-side RBAC.
- Tenant-scoped DB work should use `withTenantContext()`.
- Production runtime PostgreSQL credentials must be a non-owner, non-superuser role.
- `prisma/rls.sql` enables tenant policies.
- CI creates a separate runtime database role and proves Tenant A cannot read Tenant B and cannot insert outside its tenant context.

Do not use the schema-owner database credential as the production web runtime credential.

## CI hardening gates

The CI pipeline validates Prisma generation, PostgreSQL schema/seed, RLS isolation, TypeScript, RBAC/import/scoring/MFA tests, Next.js production build, and a real HTTP login/session smoke against `next start`. A dependency audit is also emitted for remediation tracking.

## Remaining deployment controls

Before a bank production deployment, additionally configure managed secret storage/key rotation, TLS/HSTS, approved notification delivery, backup/restore, a separate migration owner vs runtime DB role, rate limiting/WAF, centralized logs/alerts, SSO where required, and independent OWASP ASVS / penetration testing.
