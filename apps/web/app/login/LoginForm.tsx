'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type MfaMode = 'enroll' | 'verify' | null;

export default function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mfaMode, setMfaMode] = useState<MfaMode>(null);
  const [challengeToken, setChallengeToken] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');

  async function finishLogin() {
    router.replace('/dashboard');
    router.refresh();
  }

  async function submitPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
    });
    const data = await r.json();

    if (r.status === 428 && data.challengeToken) {
      setChallengeToken(data.challengeToken);
      if (data.error === 'MFA_ENROLLMENT_REQUIRED') {
        const setup = await fetch('/api/auth/mfa/setup', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ challengeToken: data.challengeToken }),
        });
        const setupData = await setup.json();
        setLoading(false);
        if (!setup.ok) {
          setError(setupData.error || 'Gagal menyiapkan MFA');
          return;
        }
        setSecret(setupData.secret);
        setOtpauthUri(setupData.otpauthUri);
        setMfaMode('enroll');
        return;
      }
      setLoading(false);
      setMfaMode('verify');
      return;
    }

    setLoading(false);
    if (!r.ok) {
      setError(data.message || data.error || 'Login gagal');
      return;
    }
    await finishLogin();
  }

  async function submitMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get('code') || '');
    const endpoint = mfaMode === 'enroll' ? '/api/auth/mfa/confirm' : '/api/auth/mfa/verify-login';
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ challengeToken, code }),
    });
    const data = await r.json();
    setLoading(false);
    if (!r.ok) {
      setError(data.error || 'Kode MFA tidak valid');
      return;
    }
    await finishLogin();
  }

  if (mfaMode) {
    return (
      <div className="space-y-5">
        <div>
          <div className="text-sm font-semibold text-navy">
            {mfaMode === 'enroll' ? 'Aktifkan Multi-Factor Authentication' : 'Verifikasi MFA'}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {mfaMode === 'enroll'
              ? 'Akun Admin/Trainer wajib menggunakan authenticator. Tambahkan akun berikut ke aplikasi authenticator, lalu masukkan kode 6 digit.'
              : 'Masukkan kode 6 digit dari aplikasi authenticator Anda.'}
          </p>
        </div>

        {mfaMode === 'enroll' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Setup key</div>
            <div className="mt-2 break-all font-mono text-sm font-semibold text-navy">{secret}</div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(secret)}
              className="mt-3 text-sm font-semibold text-teal underline-offset-4 hover:underline"
            >
              Salin setup key
            </button>
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer font-medium">Tampilkan otpauth URI</summary>
              <div className="mt-2 break-all font-mono">{otpauthUri}</div>
            </details>
          </div>
        )}

        <form onSubmit={submitMfa} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Kode authenticator</span>
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              required
              autoFocus
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl tracking-[.3em]"
            />
          </label>
          {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button disabled={loading} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
            {loading ? 'Memverifikasi…' : mfaMode === 'enroll' ? 'Aktifkan & Masuk' : 'Verifikasi & Masuk'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={submitPassword} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Password</span>
        <input name="password" type="password" required minLength={8} autoComplete="current-password" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3" />
      </label>
      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <button disabled={loading} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60">
        {loading ? 'Memproses…' : 'Masuk'}
      </button>
    </form>
  );
}
