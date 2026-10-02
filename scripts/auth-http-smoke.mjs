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
if (!/HttpOnly/i.test(login.headers.get('set-cookie')||'')) throw new Error('Session cookie is missing HttpOnly');
if (!/SameSite=Lax/i.test(login.headers.get('set-cookie')||'')) throw new Error('Session cookie is missing SameSite=Lax');

const security = {
  contentType: login.headers.get('x-content-type-options'),
  frame: login.headers.get('x-frame-options'),
  referrer: login.headers.get('referrer-policy'),
  permissions: login.headers.get('permissions-policy'),
  csp: login.headers.get('content-security-policy'),
};
if (security.contentType !== 'nosniff') throw new Error('Missing X-Content-Type-Options: nosniff');
if (security.frame !== 'DENY') throw new Error('Missing X-Frame-Options: DENY');
if (!security.referrer) throw new Error('Missing Referrer-Policy');
if (!security.permissions) throw new Error('Missing Permissions-Policy');
if (!security.csp?.includes("frame-ancestors 'none'")) throw new Error('CSP does not block framing');

const me = await fetch(`${base}/api/auth/me`, { headers: { cookie } });
if (me.status !== 200) throw new Error(`/api/auth/me failed: ${me.status} ${await me.text()}`);
const payload = await me.json();
if (payload?.user?.email !== email) throw new Error('Authenticated user mismatch');

console.log(JSON.stringify({ ok: true, email: payload.user.email, securityHeaders: security }, null, 2));


// Rate-limit smoke: invalid login attempts are throttled without affecting the valid session above.
const invalidEmail='rate-limit-'+Date.now()+'@example.local';
const statuses=[];
for(let i=0;i<9;i++){
  const r=await fetch(`${base}/api/auth/login`,{
    method:'POST',
    headers:{'content-type':'application/json','x-forwarded-for':'203.0.113.77'},
    body:JSON.stringify({email:invalidEmail,password:'Invalid-Password-2026!'}),
  });
  statuses.push(r.status);
}
if(statuses.slice(0,8).some(x=>x!==401))throw new Error('Unexpected pre-limit login statuses: '+JSON.stringify(statuses));
if(statuses[8]!==429)throw new Error('Rate-limit smoke expected 429 on ninth attempt: '+JSON.stringify(statuses));
console.log(JSON.stringify({rateLimit:true,statuses},null,2));
