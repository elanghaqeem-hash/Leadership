'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Feed={
  round:null|{roundNo:number;caseNo:number;phase:'RUNNING'|'STOPPED';startedAt:string;remainingAtStop?:number;remainingSec:number;expired:boolean};
  case:null|{no:number;label:string;brief:string};
  timerSec:number;
};

function mmss(v:number){const m=Math.floor(v/60).toString().padStart(2,'0');const s=(v%60).toString().padStart(2,'0');return m+':'+s;}

export default function BoardroomParticipant({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[now,setNow]=useState(Date.now());
 async function load(){const r=await fetch('/api/games/'+activityId+'/boardroom',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat Boardroom')}
 useEffect(()=>{void load();const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[activityId]);
 useActivityRealtime(activityId,load,4000);
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{error||'Menunggu Boardroom…'}</div>;
 if(!feed.round||!feed.case)return <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Trainer belum memulai 60-Second Boardroom.</div>;
 const remaining=feed.round.phase==='STOPPED'?Math.max(0,Number(feed.round.remainingAtStop??feed.round.remainingSec)):Math.max(0,feed.timerSec-Math.floor((now-new Date(feed.round.startedAt).getTime())/1000));
 return <div className="mt-4 space-y-4">
   <div className="rounded-2xl bg-slate-950 p-5 text-white shadow-lg">
     <div className="flex items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">60-Second Boardroom</div><div className="mt-1 text-lg font-semibold">{feed.case.label}</div></div><div className={`font-mono text-4xl font-bold ${remaining<=10?'text-red-300':'text-white'}`}>{mmss(remaining)}</div></div>
   </div>
   <div className="rounded-2xl border border-slate-200 bg-white p-4 text-base font-semibold leading-7 text-navy">{feed.case.brief}</div>
   <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Gunakan SFAIRA: Situation · Facts · Analysis · Implication · Recommendation · Action. Observer menilai Clarity, Logic, Evidence, Risk Awareness, Recommendation, dan Action.</div>
   {remaining===0&&<div className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">Waktu habis.</div>}
   {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
 </div>
}
