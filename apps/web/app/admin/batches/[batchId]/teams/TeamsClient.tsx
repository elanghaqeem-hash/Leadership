'use client';

import { useEffect, useMemo, useState } from 'react';
import { useBatchRealtime } from '@/hooks/useBatchRealtime';

type Team={id:string;name:string;number:number};
type Participant={id:string;userId:string;teamId:string|null;name:string;email:string;employeeNo:string|null;unit:string|null;title:string|null};
type Feed={batch:{id:string;code:string;name:string;teamCount:number};teams:Team[];participants:Participant[]};

export default function TeamsClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[msg,setMsg]=useState('');const[busy,setBusy]=useState('');
 async function load(){const r=await fetch('/api/batches/'+batchId+'/teams',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setMsg('')}else setMsg(d.error||'Gagal memuat tim')}
 useEffect(()=>{void load()},[batchId]);
 useBatchRealtime(batchId,load,5000);
 async function patch(body:any,key:string){setBusy(key);const r=await fetch('/api/batches/'+batchId+'/teams',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();setBusy('');if(!r.ok){setMsg(d.error||'Gagal memperbarui tim');return;}await load()}
 const counts=useMemo(()=>Object.fromEntries((feed?.teams||[]).map(t=>[t.id,(feed?.participants||[]).filter(p=>p.teamId===t.id).length])),[feed]);
 if(!feed)return <div className="p-6 text-sm text-slate-600">{msg||'Memuat pembagian tim…'}</div>;
 return <div className="space-y-6">
   <div className="rounded-2xl border border-slate-200 bg-white p-5">
     <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold">Pembagian Tim</h2><p className="mt-1 text-sm text-slate-600">{feed.participants.length} participant · {feed.teams.length} tim. Trainer dapat mengacak seimbang atau memindahkan participant secara manual.</p></div><div className="flex gap-2"><button disabled={busy!==''||feed.participants.length===0} onClick={()=>patch({action:'RANDOMIZE'},'random')} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Acak seimbang</button><button disabled={busy!==''} onClick={()=>patch({action:'CLEAR'},'clear')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Reset</button></div></div>
     <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{feed.teams.map(t=><div key={t.id} className="rounded-xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tim {t.number}</div><div className="mt-1 font-semibold text-navy">{t.name}</div><div className="mt-1 text-sm text-slate-500">{counts[t.id]||0} peserta</div></div>)}</div>
   </div>
   <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
     <div className="border-b border-slate-200 px-4 py-3 text-sm font-semibold">Participant</div>
     <div className="divide-y divide-slate-100">{feed.participants.map(p=><div key={p.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_220px] sm:items-center"><div><div className="font-semibold text-navy">{p.name}</div><div className="mt-1 text-xs text-slate-500">{p.email}{p.unit?' · '+p.unit:''}{p.title?' · '+p.title:''}</div></div><select disabled={busy!==''} value={p.teamId||''} onChange={e=>patch({action:'ASSIGN',userId:p.userId,teamId:e.target.value||null},'assign'+p.userId)} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Belum ditugaskan</option>{feed.teams.map(t=><option key={t.id} value={t.id}>Tim {t.number} — {t.name}</option>)}</select></div>)}</div>
   </div>
   {msg&&<div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{msg}</div>}
 </div>
}
