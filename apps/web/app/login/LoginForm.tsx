'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

type MfaMode = 'enroll' | 'verify' | null;
type BackendStatus = 'checking' | 'ready' | 'degraded' | 'offline';

type HealthResult = {
  ok?: boolean;
  buildId?: string;
  checks?: {
    database?: string;
    programSeed?: string;
  };
};

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
  const [backendStatus, setBackendStatus] = useState<BackendStatus>('checking');
  const [backendMessage, setBackendMessage] = useState('Memeriksa layanan…');
  const [backendBuild, setBackendBuild] = useState('');

  const checkBackend = useCallback(async () => {
    setBackendStatus('checking');
    setBackendMessage('Memeriksa layanan…');

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5_000);
    try {
      const response = await fetch('/api/health?ts=' + Date.now(), {
        cache: 'no-store',
        headers: { 'cache-control': 'no-store' },
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => ({}))) as HealthResult;
      setBackendBuild(String(data.buildId || ''));

      if (data.checks?.database === 'UP') {
        if (data.ok) {
          setBackendStatus('ready');
          setBackendMessage('Layanan siap');
        } else {
          setBackendStatus('degraded');
          setBackendMessage('Database aktif, data program belum siap');
        }
        return;
      }

      setBackendStatus('offline');
      setBackendMessage('Database belum terhubung');
    } catch {
      setBackendStatus('offline');
      setBackendMessage('Backend tidak merespons');
    } finally {
      window.clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

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

  const statusClass =
    backendStatus === 'ready'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
      : backendStatus === 'degraded'
        ? 'border-amber-200 bg-amber-50 text-amber-800'
        : backendStatus === 'offline'
          ? 'border-red-200 bg-red-50 text-red-700'
          : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <form onSubmit={submitPassword} className="space-y-4" aria-busy={loading}>
      <div className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-xs ${statusClass}`}>
        <div>
          <div className="font-semibold">{backendMessage}</div>
          {backendBuild && <div className="mt-0.5 font-mono text-[10px] opacity-75">{backendBuild}</div>}
        </div>
        <button
          type="button"
          onClick={() => void checkBackend()}
          disabled={backendStatus === 'checking' || loading}
          className="shrink-0 rounded-lg border border-current/20 px-2 py-1 font-semibold disabled:opacity-50"
        >
          {backendStatus === 'checking' ? 'Cek…' : 'Cek ulang'}
        </button>
      </div>
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
