'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Feed={
  round:null|{roundNo:number;phase:'RUNNING'|'CLOSED';sentEventNos:number[]};
  events:Array<{no:number;event:string}>;
  observerFocus:Record<string,string>|null;
  teamBoards:null|Array<{teamId:string;payload:any;version:number;updatedAt:string}>;
  leaderboard:null|Array<{team:{id:string;name:string;number:number};total:number;rank:number;weakestDimension:string|null;weakestPercent:number|null;scoredDimensions:number}>;
};

export default function WarRoomTrainerPanel({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/war-room',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat War Room')}
 useEffect(()=>{void load()},[activityId]);
 useActivityRealtime(activityId,load,5000);
 async function control(command:'START'|'SEND_EVENT'|'CLOSE'){setBusy(command);const r=await fetch('/api/games/'+activityId+'/war-room',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({command})});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Kontrol War Room gagal');return;}await load()}
 const lastEvent=feed?.events?.[feed.events.length-1];
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">War Room Control</div><div className="mt-1 text-sm font-semibold">{feed?.round?'Round '+feed.round.roundNo+' · '+feed.round.phase+' · '+feed.round.sentEventNos.length+'/7 event':'Belum dimulai'}</div></div><div className="grid grid-cols-3 gap-2"><button disabled={busy!==''||Boolean(feed?.round&&feed.round.phase==='RUNNING')} onClick={()=>control('START')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Start</button><button disabled={busy!==''||!feed?.round||feed.round.phase!=='RUNNING'||feed.round.sentEventNos.length>=7} onClick={()=>control('SEND_EVENT')} className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-30">Send Event</button><button disabled={busy!==''||!feed?.round||feed.round.phase!=='RUNNING'} onClick={()=>control('CLOSE')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Close</button></div></div>
   {lastEvent&&<div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100"><b>Event {lastEvent.no}:</b> {lastEvent.event}{feed?.observerFocus?.[String(lastEvent.no)]&&<div className="mt-1 text-xs text-amber-200">Observer focus: {feed.observerFocus[String(lastEvent.no)]}</div>}</div>}
   {feed?.teamBoards&&<div className="mt-3 text-xs text-slate-400">{feed.teamBoards.length} team board sudah pernah disimpan.</div>}
   {feed?.leaderboard&&<div className="mt-3 space-y-1">{feed.leaderboard.map(x=><div key={x.team.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-xs"><span>#{x.rank} {x.team.name}</span><span><b>{Math.round(x.total)}</b>/100 · {x.scoredDimensions}/8 dimensi{x.weakestDimension?' · Weakest '+x.weakestDimension:''}</span></div>)}</div>}
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
