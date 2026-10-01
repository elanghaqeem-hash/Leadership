'use client';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
export default function LoginForm(){
 const router=useRouter(); const [error,setError]=useState(''); const [loading,setLoading]=useState(false);
 async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setLoading(true);setError('');const fd=new FormData(e.currentTarget);const r=await fetch('/api/auth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({email:fd.get('email'),password:fd.get('password')})});const data=await r.json();setLoading(false);if(!r.ok){setError(data.message||data.error||'Login gagal');return;}router.replace('/dashboard');router.refresh();}
 return <form onSubmit={submit} className="space-y-4"><label className="block"><span className="mb-1 block text-sm font-medium">Email</span><input name="email" type="email" required autoComplete="email" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3" /></label><label className="block"><span className="mb-1 block text-sm font-medium">Password</span><input name="password" type="password" required minLength={8} autoComplete="current-password" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3" /></label>{error&&<div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}<button disabled={loading} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white hover:bg-slate-800 disabled:opacity-60">{loading?'Memproses…':'Masuk'}</button></form>
}
