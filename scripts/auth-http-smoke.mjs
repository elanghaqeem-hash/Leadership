const base = process.env.APP_URL || 'http://127.0.0.1:3000';
const email = process.env.AUTH_SMOKE_EMAIL;
const password = process.env.AUTH_SMOKE_PASSWORD;
if (!email || !password) throw new Error('AUTH_SMOKE_EMAIL and AUTH_SMOKE_PASSWORD are required');

const login = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
if (login.status !== 200) throw new Error(`Login failed: ${login.status} ${await login.text()}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Login did not return a session cookie');

const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
if (me.status !== 200) throw new Error(`/api/auth/me failed: ${me.status} ${await me.text()}`);
const payload = await me.json();
if (payload?.user?.email !== email) throw new Error('Authenticated user mismatch');

console.log(JSON.stringify({ ok: true, email: payload.user.email }, null, 2));
