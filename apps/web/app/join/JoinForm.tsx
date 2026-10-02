'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinForm({initialCode=''}:{initialCode?:string}){
 const router=useRouter();const[code,setCode]=useState(initialCode.replace(/\D/g,'').slice(0,6));const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');const r=await fetch('/api/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code})});const d=await r.json();setBusy(false);if(!r.ok){setError(d.error||'Tidak dapat masuk kelas');return;}router.push(d.destination)}
 return <form onSubmit={submit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"><div className="text-xs font-bold uppercase tracking-[.18em] text-teal">Join Class</div><h1 className="mt-2 text-3xl font-semibold text-navy">Masukkan kode 6 digit</h1><p className="mt-2 text-sm leading-6 text-slate-600">Kode hanya membuka batch yang sudah menugaskan akun Anda. Kode tidak dapat digunakan untuk mendaftarkan orang yang tidak ada di daftar peserta.</p><input value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required autoFocus className="mt-6 w-full rounded-2xl border border-slate-300 px-4 py-4 text-center font-mono text-3xl font-bold tracking-[.35em] text-navy"/>{error&&<div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}<button disabled={busy||code.length!==6} className="mt-5 w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Memverifikasi…':'Masuk Kelas'}</button></form>
}
