'use client';

import { useEffect, useState } from 'react';

type Feed={
  activity:{id:string;title:string;status:string};
  round:null|{roundNo:number;eventNo:number;phase:'VOTING'|'REVEALED'|'CLOSED'};
  event:null|{no:number;event:string;dimension:string;doMinutes:number};
  myTeamDecision:string|null;
  answer:null|{best:string;acceptable:string};
  eventResults:null|Array<{team:{id:string;name:string;number:number};decision:string|null;result:any}>;
  leaderboard:null|Array<{team:{id:string;name:string;number:number};total:number;totalMinutes:number;balanceIndex:number;decisionsCount:number;rank:number}>;
};

const decisions=['Do','Delegate','Escalate','Defer'];

export default function ArenaParticipant({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/games/'+activityId+'/arena',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat Arena')}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),1500);return()=>clearInterval(t)},[activityId]);
 async function choose(decision:string){setBusy(true);const r=await fetch('/api/games/'+activityId+'/arena',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision})});const d=await r.json();setBusy(false);if(!r.ok){setError(d.error||'Gagal menyimpan keputusan');return;}await load()}
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{error||'Menunggu Arena…'}</div>;
 if(!feed.round||!feed.event)return <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Trainer belum memulai event Arena.</div>;
 const revealed=feed.round.phase!=='VOTING';
 return <div className="mt-4 space-y-4">
   <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
     <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Event {feed.event.no} · {feed.event.dimension}</div>
     <div className="mt-2 text-lg font-semibold text-navy">{feed.event.event}</div>
     <div className="mt-2 text-xs text-slate-500">Jika dipilih Do: {feed.event.doMinutes} menit</div>
   </div>
   {feed.round.phase==='VOTING'&&<div className="grid grid-cols-2 gap-2">{decisions.map(d=><button key={d} disabled={busy} onClick={()=>choose(d)} className={`rounded-xl px-4 py-3 font-bold ring-1 ${feed.myTeamDecision===d?'bg-teal text-white ring-teal':'bg-white text-navy ring-slate-200'}`}>{d}</button>)}</div>}
   {feed.myTeamDecision&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Keputusan tim: <b>{feed.myTeamDecision}</b>{!revealed?' · masih dapat diubah sebelum Reveal':''}</div>}
   {revealed&&feed.answer&&<div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><b>Best:</b> {feed.answer.best} · <b>Acceptable:</b> {feed.answer.acceptable}</div>}
   {revealed&&feed.leaderboard&&<div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="font-semibold text-navy">Leaderboard sementara</div><div className="mt-3 space-y-2">{feed.leaderboard.map(x=><div key={x.team.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>#{x.rank} {x.team.name}</span><b>{x.total} pts</b></div>)}</div></div>}
   {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
 </div>
}
