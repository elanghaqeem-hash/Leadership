'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Feed={
  round:null|{roundNo:number;eventNo:number;phase:'VOTING'|'REVEALED'|'CLOSED'};
  event:null|{no:number;event:string;dimension:string;doMinutes:number};
  answer:null|{best:string;acceptable:string};
  eventResults:null|Array<{team:{id:string;name:string;number:number};decision:string|null;result:any}>;
  leaderboard:null|Array<{team:{id:string;name:string;number:number};total:number;totalMinutes:number;balanceIndex:number;decisionsCount:number;rank:number}>;
};

export default function ArenaTrainerPanel({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/arena',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat Arena')}
 useEffect(()=>{void load()},[activityId]);
 useActivityRealtime(activityId,load,5000);
 async function control(command:'START'|'REVEAL'|'CLOSE'){setBusy(command);const r=await fetch('/api/games/'+activityId+'/arena',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({command})});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Kontrol Arena gagal');return;}await load()}
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Arena Control</div><div className="mt-1 text-sm font-semibold">{feed?.round?'Round '+feed.round.roundNo+' · Event '+feed.round.eventNo+' · '+feed.round.phase:'Belum dimulai'}</div></div><div className="grid grid-cols-3 gap-2"><button disabled={busy!==''||Boolean(feed?.round&&feed.round.phase!=='CLOSED')} onClick={()=>control('START')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Next Event</button><button disabled={busy!==''||!feed?.round||feed.round.phase!=='VOTING'} onClick={()=>control('REVEAL')} className="rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-30">Reveal</button><button disabled={busy!==''||!feed?.round||feed.round.phase==='CLOSED'} onClick={()=>control('CLOSE')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Close</button></div></div>
   {feed?.event&&<div className="mt-3 rounded-lg bg-white/5 p-3 text-sm"><b>Event {feed.event.no}:</b> {feed.event.event}<div className="mt-1 text-xs text-slate-400">{feed.event.dimension} · Do {feed.event.doMinutes} menit</div></div>}
   {feed?.eventResults&&<div className="mt-3 grid gap-2 sm:grid-cols-2">{feed.eventResults.map(r=><div key={r.team.id} className="rounded-lg bg-white/5 p-2 text-xs"><div className="flex justify-between"><span>{r.team.name}</span><b>{r.decision||'—'}</b></div>{r.result&&<div className="mt-1 text-slate-400">{r.result.points} pts · {r.result.minutes} min{r.result.riskPenalty?' · '+r.result.riskPenalty+' penalty':''}</div>}</div>)}</div>}
   {feed?.answer&&<div className="mt-2 text-xs text-emerald-300">Best {feed.answer.best} · Acceptable {feed.answer.acceptable}</div>}
   {feed?.leaderboard&&<div className="mt-3 space-y-1">{feed.leaderboard.map(x=><div key={x.team.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"><span>#{x.rank} {x.team.name}</span><span><b>{x.total}</b> pts · {x.totalMinutes} min · Balance {Math.round(x.balanceIndex*100)}%</span></div>)}</div>}
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
