'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Feed={
  participantCount:number;
  submittedCount:number;
  exact480Count:number;
  completionPct:number;
  averageByCategory:Record<string,number>;
  topTimeCategories:Array<{category:string;averageMinutes:number}>;
};

export default function MinuteChallengeTrainerPanel({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/minute-challenge',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat G2')}
 useEffect(()=>{void load()},[activityId]);
 useActivityRealtime(activityId,load,5000);
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="text-xs font-bold uppercase tracking-wider text-slate-400">G2 · 480-Minute Challenge</div>
   {feed&&<>
     <div className="mt-2 grid grid-cols-3 gap-2 text-center">
       <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-white">{feed.submittedCount}/{feed.participantCount}</div><div className="text-[11px] text-slate-400">Submitted</div></div>
       <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-emerald-300">{feed.exact480Count}</div><div className="text-[11px] text-slate-400">Exactly 480</div></div>
       <div className="rounded-lg bg-white/5 p-2"><div className="text-lg font-bold text-amber-300">{Math.round(feed.completionPct)}%</div><div className="text-[11px] text-slate-400">Completion</div></div>
     </div>
     <div className="mt-3 grid grid-cols-2 gap-2">{feed.topTimeCategories.map(x=><div key={x.category} className="rounded-lg bg-white/5 px-3 py-2 text-xs"><div className="text-slate-400">{x.category}</div><div className="mt-1 font-semibold text-white">{x.averageMinutes} min avg</div></div>)}</div>
   </>}
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
