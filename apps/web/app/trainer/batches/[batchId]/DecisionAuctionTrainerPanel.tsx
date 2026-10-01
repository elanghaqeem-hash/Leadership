'use client';

import { useEffect, useState } from 'react';

type Feed={
  round:null|{round:string;phase:'CHOOSING'|'CLOSED'};
  roundInfo:string|null;
  readiness:null|Array<{team:{id:string;name:string;number:number};submitted:boolean}>;
  leaderboard:null|Array<{team:{id:string;name:string;number:number};complete:boolean;rank:number|null;score:any}>;
};

export default function DecisionAuctionTrainerPanel({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/decision-auction',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat Decision Auction')}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),1500);return()=>clearInterval(t)},[activityId]);
 async function control(command:'START'|'CLOSE'){setBusy(command);const r=await fetch('/api/games/'+activityId+'/decision-auction',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({command})});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Kontrol Decision Auction gagal');return;}await load()}
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Decision Auction Control</div><div className="mt-1 text-sm font-semibold">{feed?.round?feed.round.round+' · '+feed.round.phase:'Belum dimulai'}</div></div><div className="grid grid-cols-2 gap-2"><button disabled={busy!==''||Boolean(feed?.round&&feed.round.phase==='CHOOSING')} onClick={()=>control('START')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Start Next Round</button><button disabled={busy!==''||!feed?.round||feed.round.phase!=='CHOOSING'} onClick={()=>control('CLOSE')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Close Round</button></div></div>
   {feed?.roundInfo&&<div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100">{feed.roundInfo}</div>}
   {feed?.readiness&&<div className="mt-3 grid gap-2 sm:grid-cols-2">{feed.readiness.map(x=><div key={x.team.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"><span>{x.team.name}</span><b className={x.submitted?'text-emerald-300':'text-slate-500'}>{x.submitted?'Submitted':'Waiting'}</b></div>)}</div>}
   {feed?.leaderboard&&<div className="mt-3 space-y-1">{feed.leaderboard.filter(x=>x.complete).map(x=><div key={x.team.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"><span>#{x.rank} {x.team.name}</span><span><b>NET {Math.round(x.score?.net||0)}</b> · Switch {Math.round(x.score?.switchingCost||0)} · Risk {x.score?.riskExposure||0}</span></div>)}</div>}
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
