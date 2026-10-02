'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Feed={
  round:null|{roundNo:number;caseNo:number;phase:'RUNNING'|'STOPPED';startedAt:string;remainingAtStop?:number;remainingSec:number;expired:boolean};
  case:null|{no:number;label:string;brief:string};
  timerSec:number;
};

function mmss(v:number){const m=Math.floor(v/60).toString().padStart(2,'0');const s=(v%60).toString().padStart(2,'0');return m+':'+s;}

export default function BoardroomTrainerPanel({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');const[now,setNow]=useState(Date.now());
 async function load(){const r=await fetch('/api/games/'+activityId+'/boardroom',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat Boardroom')}
 useEffect(()=>{void load();const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[activityId]);
 useActivityRealtime(activityId,load,4000);
 const remaining=feed?.round?(feed.round.phase==='STOPPED'?Math.max(0,Number(feed.round.remainingAtStop??feed.round.remainingSec)):Math.max(0,feed.timerSec-Math.floor((now-new Date(feed.round.startedAt).getTime())/1000))):(feed?.timerSec??60);
 async function control(command:'START'|'STOP'){setBusy(command);const r=await fetch('/api/games/'+activityId+'/boardroom',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({command})});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Kontrol Boardroom gagal');return;}await load()}
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">60-Second Boardroom</div><div className="mt-1 text-sm font-semibold">{feed?.case?feed.case.label:'Belum dimulai'}</div></div><div className={`font-mono text-3xl font-bold ${remaining<=10?'text-red-300':'text-amber-300'}`}>{mmss(remaining)}</div></div>
   {feed?.case&&<div className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-slate-200">{feed.case.brief}</div>}
   <div className="mt-3 grid grid-cols-2 gap-2"><button disabled={busy!==''||Boolean(feed?.round&&feed.round.phase==='RUNNING'&&remaining>0)} onClick={()=>control('START')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Start Next Case</button><button disabled={busy!==''||!feed?.round||feed.round.phase!=='RUNNING'} onClick={()=>control('STOP')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Stop Timer</button></div>
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
