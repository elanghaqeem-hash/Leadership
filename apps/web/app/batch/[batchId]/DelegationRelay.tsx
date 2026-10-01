'use client';

import { useEffect, useState } from 'react';

function mmss(seconds:number){
 const m=Math.floor(seconds/60).toString().padStart(2,'0');
 const s=(seconds%60).toString().padStart(2,'0');
 return m+':'+s;
}

export default function DelegationRelay({activity,content}:{activity:any;content:any}){
 const timerSec=Number(activity.config?.timerSec||content?.payload?.timerSec||1200);
 const openedAt=activity.openedAt?new Date(activity.openedAt).getTime():Date.now();
 const[now,setNow]=useState(Date.now());
 useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[]);
 const remaining=Math.max(0,timerSec-Math.floor((now-openedAt)/1000));
 return <div className="mt-4 space-y-4">
   <div className="rounded-2xl bg-slate-950 p-5 text-white"><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Delegation Relay</div><div className="mt-1 text-sm text-slate-300">Leader hanya menjelaskan, bertanya, dan memeriksa checkpoint.</div></div><div className={`font-mono text-4xl font-bold ${remaining<=60?'text-red-300':'text-white'}`}>{mmss(remaining)}</div></div></div>
   <div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Tugas</div><div className="mt-2 text-sm font-semibold leading-6 text-navy">{content?.payload?.task||'Instruksi belum tersedia.'}</div></div>
   <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200"><div className="text-xs font-bold uppercase tracking-wider text-amber-800">Aturan</div><div className="mt-2 text-sm leading-6 text-amber-950">{content?.payload?.rule||''}</div></div>
   <div className="rounded-2xl bg-slate-50 p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Observer checklist</div><div className="mt-2 text-sm leading-6 text-slate-700">{content?.payload?.observerChecklist||'What · Why · Expected outcome · Authority · Boundary · Deadline · Checkpoint · Evidence'}</div></div>
   {remaining===0&&<div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">Waktu habis.</div>}
 </div>
}
