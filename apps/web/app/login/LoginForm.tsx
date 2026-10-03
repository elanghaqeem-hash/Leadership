'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

type MfaMode = 'enroll' | 'verify' | null;

type JsonResult = {
  response: Response;
  data: Record<string, any>;
};

async function postJson(url: string, body: unknown, timeoutMs = 12_000): Promise<JsonResult> {
  const controller = new AbortController();
  let timer = 0;

  const request = fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
    signal: controller.signal,
    cache: 'no-store',
  });

  const timeout = new Promise<Response>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      controller.abort();
      reject(new Error('LOGIN_TIMEOUT'));
    }, timeoutMs);
  });

  try {
    const response = await Promise.race([request, timeout]);
    let data: Record<string, any> = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    return { response, data };
  } catch (error) {
    if (
      (error instanceof Error && error.message === 'LOGIN_TIMEOUT') ||
      (error instanceof DOMException && error.name === 'AbortError')
    ) {
      throw new Error('Layanan login tidak merespons dalam 12 detik. Coba lagi atau periksa koneksi database.');
    }
    throw new Error('Tidak dapat terhubung ke layanan login. Silakan coba lagi.');
  } finally {
    if (timer) window.clearTimeout(timer);
  }
}

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
    if (loading) return;
    setLoading(true);
    setError('');

    const fd = new FormData(e.currentTarget);
    try {
      const { response, data } = await postJson('/api/auth/login', {
        email: fd.get('email'),
        password: fd.get('password'),
      });

      if (response.status === 428 && data.challengeToken) {
        setChallengeToken(String(data.challengeToken));
        if (data.error === 'MFA_ENROLLMENT_REQUIRED') {
          const setup = await postJson('/api/auth/mfa/setup', {
            challengeToken: data.challengeToken,
          });
          if (!setup.response.ok) {
            setError(String(setup.data.error || 'Gagal menyiapkan MFA'));
            return;
          }
          setSecret(String(setup.data.secret || ''));
          setOtpauthUri(String(setup.data.otpauthUri || ''));
          setMfaMode('enroll');
          return;
        }
        setMfaMode('verify');
        return;
      }

      if (!response.ok) {
        setError(String(data.message || data.error || 'Login gagal'));
        return;
      }
      await finishLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  }

  async function submitMfa(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get('code') || '');
    const endpoint = mfaMode === 'enroll' ? '/api/auth/mfa/confirm' : '/api/auth/mfa/verify-login';

    try {
      const { response, data } = await postJson(endpoint, { challengeToken, code });
      if (!response.ok) {
        setError(String(data.error || 'Kode MFA tidak valid'));
        return;
      }
      await finishLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verifikasi MFA gagal. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
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

        <form onSubmit={submitMfa} className="space-y-4" aria-busy={loading}>
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
              disabled={loading}
              className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-center font-mono text-xl tracking-[.3em] disabled:bg-slate-50"
            />
          </label>
          {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          <button disabled={loading} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
            {loading ? 'Memverifikasi…' : mfaMode === 'enroll' ? 'Aktifkan & Masuk' : 'Verifikasi & Masuk'}
          </button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={submitPassword} className="space-y-4" aria-busy={loading}>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Email</span>
        <input name="email" type="email" required autoComplete="email" disabled={loading} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-50" />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-medium">Password</span>
        <input name="password" type="password" required minLength={8} autoComplete="current-password" disabled={loading} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 disabled:bg-slate-50" />
      </label>
      {error && <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <button disabled={loading} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:cursor-wait disabled:opacity-60">
        {loading ? 'Memproses…' : 'Masuk'}
      </button>
      <p className="text-xs leading-5 text-slate-500">
        Jika layanan login tidak merespons dalam 12 detik, proses dihentikan otomatis dan Anda dapat mencoba kembali.
      </p>
    </form>
  );
}
