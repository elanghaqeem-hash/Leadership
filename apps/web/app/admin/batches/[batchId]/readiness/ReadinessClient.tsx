'use client';

import { useEffect, useState } from 'react';
import { useBatchRealtime } from '@/hooks/useBatchRealtime';

type Check={code:string;label:string;status:'PASS'|'WARN'|'BLOCK';detail:string};
type Feed={
 batch:{id:string;code:string;name:string;status:string};
 summary:{ready:boolean;blocking:number;warnings:number;passed:number;total:number};
 lifecycle:{canChangeStatus:boolean;nextStatus:string|null};
 checks:Check[];
 counts:{participants:number;assigned:number;teams:number;leadTrainers:number;facilitators:number;managerLinks:number;activationPending:number};
};

function badge(status:Check['status']){
 return status==='PASS'?'bg-emerald-50 text-emerald-700 ring-emerald-200':status==='WARN'?'bg-amber-50 text-amber-800 ring-amber-200':'bg-red-50 text-red-700 ring-red-200';
}

export default function ReadinessClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/batches/'+batchId+'/readiness',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat readiness')}
 async function advance(){if(!feed?.lifecycle.nextStatus)return;setBusy(true);setError('');const r=await fetch('/api/batches/'+batchId+'/lifecycle',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:feed.lifecycle.nextStatus})});const d=await r.json();setBusy(false);if(!r.ok){setError(d.error||'Gagal mengubah status batch');return;}await load()}
 useEffect(()=>{void load()},[batchId]);useBatchRealtime(batchId,load,5000);
 if(!feed)return <div className="p-6 text-sm text-slate-600">{error||'Memeriksa kesiapan batch…'}</div>;
 return <div className="space-y-6">
   <section className={`rounded-3xl p-6 text-white ${feed.summary.ready?'bg-emerald-950':'bg-slate-950'}`}>
     <div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Go-Live Readiness</div>
     <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-3xl font-semibold">{feed.batch.name}</h2><p className="mt-1 text-sm text-white/70">{feed.batch.code} · {feed.batch.status}</p></div><div className="text-right"><div className="text-4xl font-bold">{feed.summary.ready?'READY':'NOT READY'}</div><div className="mt-1 text-sm text-white/70">{feed.summary.blocking} blocker · {feed.summary.warnings} warning</div></div>{feed.lifecycle.canChangeStatus&&feed.lifecycle.nextStatus&&<button disabled={busy||feed.lifecycle.nextStatus==='ACTIVE'&&!feed.summary.ready} onClick={advance} className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950 disabled:opacity-40">{busy?'Memproses…':'Advance to '+feed.lifecycle.nextStatus}</button>}</div>
   </section>
   <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[
    ['Participant',feed.counts.participants],['Assigned',feed.counts.assigned],['Teams',feed.counts.teams],['Lead Trainer',feed.counts.leadTrainers],['Facilitator',feed.counts.facilitators],['Manager Map',feed.counts.managerLinks],
   ].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-2xl font-semibold text-navy">{value}</div></div>)}</div>
   <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-200 px-5 py-4"><h3 className="text-lg font-semibold text-navy">Readiness checks</h3><p className="mt-1 text-sm text-slate-500">Blocker harus diselesaikan sebelum kelas dimulai. Warning dapat diterima dengan keputusan operasional yang jelas.</p></div><div className="divide-y divide-slate-100">{feed.checks.map(c=><div key={c.code} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><div className="font-semibold text-slate-800">{c.label}</div><div className="mt-1 text-sm text-slate-500">{c.detail}</div></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ring-1 ${badge(c.status)}`}>{c.status}</span></div>)}</div></section>
   <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">Readiness ini tidak otomatis membuka batch. Trainer/Program Admin tetap mengendalikan status aktivitas dari Trainer Console.</div>
   {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
 </div>
}
