'use client';

import { useEffect, useState } from 'react';

type Feed={
  activity:{id:string;type:string;title:string;status:string};
  round:null|{roundNo:number;cardNo:number;stage:'BASE'|'TWIST';phase:'VOTING'|'REVEALED'|'CLOSED'};
  card?:Record<string,any>|null;
  totalVotes?:number;
  aggregate?:Record<string,number>|null;
  answer?:any;
};

export default function LiveGameTrainerPanel({activityId,activityType}:{activityId:string;activityType:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/live',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat game')}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),1500);return()=>clearInterval(t)},[activityId]);
 async function control(command:'START'|'TWIST'|'REVEAL'|'CLOSE'){setBusy(command);setError('');const r=await fetch('/api/games/'+activityId+'/live',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({command})});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Kontrol game gagal');return;}await load()}
 const prompt=feed?.card?.situation||feed?.card?.prompt||feed?.card?.statement||'';
 const roundLabel=feed?.round?'Round '+feed.round.roundNo+' · Kartu '+feed.round.cardNo+' · '+feed.round.stage+' · '+feed.round.phase:'Belum ada round';
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="flex flex-wrap items-center justify-between gap-2">
     <div>
       <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Game Control</div>
       <div className="mt-1 text-sm font-semibold text-white">{roundLabel}</div>
     </div>
     <div className="rounded-lg bg-white/5 px-3 py-2 text-xs text-slate-300">{feed?.totalVotes??0} vote</div>
   </div>
   {prompt&&<div className="mt-3 rounded-lg bg-white/5 p-3 text-sm text-slate-200">{prompt}</div>}
   {feed?.round?.stage==='TWIST'&&feed.card?.twistPrompt&&<div className="mt-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-200">Twist: {String(feed.card.twistPrompt)}</div>}
   {feed?.aggregate&&<div className="mt-3 flex flex-wrap gap-2">{Object.entries(feed.aggregate).map(([k,v])=><span key={k} className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-slate-200">{k}: <b>{v}</b></span>)}</div>}
   {feed?.answer?.expected&&<div className="mt-2 text-xs text-emerald-300">Expected: {String(feed.answer.expected)}</div>}
   <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
     <button disabled={busy!==''||Boolean(feed?.round&&feed.round.phase!=='CLOSED')} onClick={()=>control('START')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Start Round</button>
     <button disabled={busy!==''||activityType!=='PRIORITY_POKER'||!feed?.round||feed.round.phase==='CLOSED'||feed.round.stage==='TWIST'} onClick={()=>control('TWIST')} className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-30">Send Twist</button>
     <button disabled={busy!==''||!feed?.round||feed.round.phase!=='VOTING'} onClick={()=>control('REVEAL')} className="rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-30">Reveal</button>
     <button disabled={busy!==''||!feed?.round||feed.round.phase==='CLOSED'} onClick={()=>control('CLOSE')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Close Round</button>
   </div>
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
