'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Feed={
  round:null|{phase:'PLANNING'|'CLOSED';sentDisruptions:number[]};
  disruptions:Array<{no:number;label:string;event:string}>;
  readiness:null|Array<{team:{id:string;name:string;number:number};submitted:boolean}>;
};

export default function CalendarTetrisTrainerPanel({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/calendar-tetris',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat Calendar Tetris')}
 useEffect(()=>{void load()},[activityId]);
 useActivityRealtime(activityId,load,5000);
 async function control(command:'START'|'SEND_DISRUPTION'|'CLOSE'){setBusy(command);const r=await fetch('/api/games/'+activityId+'/calendar-tetris',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({command})});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Kontrol Calendar Tetris gagal');return;}await load()}
 const last=feed?.disruptions?.[feed.disruptions.length-1];
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Calendar Tetris Control</div><div className="mt-1 text-sm font-semibold">{feed?.round?feed.round.phase+' · '+feed.round.sentDisruptions.length+'/4 disruption':'Belum dimulai'}</div></div><div className="grid grid-cols-3 gap-2"><button disabled={busy!==''||Boolean(feed?.round&&feed.round.phase==='PLANNING')} onClick={()=>control('START')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Start</button><button disabled={busy!==''||!feed?.round||feed.round.phase!=='PLANNING'||feed.round.sentDisruptions.length>=4} onClick={()=>control('SEND_DISRUPTION')} className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-30">Send Disruption</button><button disabled={busy!==''||!feed?.round||feed.round.phase!=='PLANNING'} onClick={()=>control('CLOSE')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Close</button></div></div>
   {last&&<div className="mt-3 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100"><b>{last.label}:</b> {last.event}</div>}
   {feed?.readiness&&<div className="mt-3 grid gap-2 sm:grid-cols-2">{feed.readiness.map(x=><div key={x.team.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"><span>{x.team.name}</span><b className={x.submitted?'text-emerald-300':'text-slate-500'}>{x.submitted?'Saved':'Waiting'}</b></div>)}</div>}
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
