'use client';

import { useEffect, useMemo, useState } from 'react';
import { useBatchRealtime } from '@/hooks/useBatchRealtime';

type Observer={userId:string;name:string;email:string};
type Team={id:string;number:number;name:string;_count:{members:number}};
type Assignment={id:string;observerUserId:string;teamId:string};
type Feed={
 batch:{id:string;code:string;name:string};
 observers:Observer[];
 teams:Team[];
 assignments:Assignment[];
 coverage:{assignedTeams:number;totalTeams:number;observersWithAssignment:number;totalObservers:number};
};

export default function ObserverAssignmentsClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[busy,setBusy]=useState('');const[msg,setMsg]=useState('');
 async function load(){const r=await fetch('/api/batches/'+batchId+'/observer-assignments',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setMsg('')}else setMsg(d.error||'Gagal memuat observer assignment')}
 useEffect(()=>{void load()},[batchId]);useBatchRealtime(batchId,load,5000);
 async function patch(body:any,key:string){setBusy(key);setMsg('');const r=await fetch('/api/batches/'+batchId+'/observer-assignments',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();setBusy('');if(!r.ok){setMsg(d.error||'Gagal memperbarui assignment');return;}await load()}
 const map=useMemo(()=>new Set((feed?.assignments||[]).map(a=>a.observerUserId+':'+a.teamId)),[feed]);
 if(!feed)return <div className="p-6 text-sm text-slate-600">{msg||'Memuat observer assignment…'}</div>;
 return <div className="space-y-6">
   <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-xl font-semibold text-navy">Observer Coverage</h2><p className="mt-1 text-sm text-slate-600">{feed.coverage.assignedTeams}/{feed.coverage.totalTeams} tim covered · {feed.coverage.observersWithAssignment}/{feed.coverage.totalObservers} observer memiliki assignment.</p></div><div className="flex gap-2"><button disabled={busy!==''||!feed.observers.length||!feed.teams.length} onClick={()=>patch({action:'AUTO_DISTRIBUTE'},'auto')} className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Auto distribute</button><button disabled={busy!==''||!feed.assignments.length} onClick={()=>patch({action:'CLEAR'},'clear')} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-40">Clear</button></div></div></section>
   {!feed.observers.length?<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Belum ada Co-Facilitator aktif. Tambahkan dari menu Trainer & Observer.</div>:<div className="space-y-4">{feed.observers.map(observer=><section key={observer.userId} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold text-navy">{observer.name}</div><div className="text-sm text-slate-500">{observer.email}</div></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{feed.assignments.filter(a=>a.observerUserId===observer.userId).length} tim</span></div><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{feed.teams.map(team=>{const key=observer.userId+':'+team.id;const assigned=map.has(key);return <button type="button" key={team.id} disabled={busy!==''} onClick={()=>patch({action:'SET',observerUserId:observer.userId,teamId:team.id,assigned:!assigned},key)} className={`rounded-xl p-3 text-left ring-1 transition ${assigned?'bg-teal text-white ring-teal':'bg-slate-50 text-slate-700 ring-slate-200'}`}><div className="text-xs font-bold uppercase tracking-wider opacity-70">Tim {team.number}</div><div className="mt-1 font-semibold">{team.name}</div><div className="mt-1 text-xs opacity-70">{team._count.members} member</div></button>})}</div></section>)}</div>}
   {msg&&<div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{msg}</div>}
 </div>
}
