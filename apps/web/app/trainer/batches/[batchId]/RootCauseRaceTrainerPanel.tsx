'use client';

import { useEffect, useState } from 'react';

type TeamRow={team:{id:string;name:string;number:number};answer:any;elapsedSec:number|null};
type Feed={
  round:null|{phase:'RUNNING'|'CLOSED';startedAt:string;durationSec:number};
  teams:TeamRow[]|null;
  verifiedLeaderboard:null|Array<{team:{id:string;name:string;number:number};elapsedSec:number;rank:number}>;
};

function mmss(seconds:number){const m=Math.floor(seconds/60).toString().padStart(2,'0');const s=(seconds%60).toString().padStart(2,'0');return m+':'+s;}

export default function RootCauseRaceTrainerPanel({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');const[duration,setDuration]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/root-cause-race',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat Root Cause Race')}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),1500);return()=>clearInterval(t)},[activityId]);
 async function control(body:any,key:string){setBusy(key);const r=await fetch('/api/games/'+activityId+'/root-cause-race',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Kontrol Root Cause Race gagal');return;}await load()}
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Root Cause Race Control</div><div className="mt-1 text-sm font-semibold">{feed?.round?feed.round.phase+' · '+Math.round(feed.round.durationSec/60)+' min':'Set durasi sebelum mulai'}</div></div>{!feed?.round||feed.round.phase==='CLOSED'?<div className="flex gap-2"><input type="number" min="1" max="60" value={duration} onChange={e=>setDuration(e.target.value)} placeholder="Menit" className="w-20 rounded-lg bg-white/10 px-2 py-2 text-xs text-white ring-1 ring-white/10"/><button disabled={busy!==''||Number(duration)<1||Number(duration)>60} onClick={()=>control({command:'START',durationSec:Number(duration)*60},'start')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Start</button></div>:<button disabled={busy!==''} onClick={()=>control({command:'CLOSE'},'close')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Close</button>}</div>
   <div className="mt-2 text-[11px] leading-4 text-slate-500">Durasi dibuat trainer-configurable karena workbook sumber tidak menetapkan timebox Root Cause Race.</div>
   {feed?.teams&&<div className="mt-3 space-y-2">{feed.teams.map(x=><div key={x.team.id} className="rounded-lg bg-white/5 p-3 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{x.team.name}</span><span>{x.answer?mmss(x.elapsedSec||0):'Waiting'}</span></div><div className="mt-2 text-slate-300">{x.answer?.rootCause||'Belum ada root cause'}</div>{x.answer&&<div className="mt-2 grid grid-cols-2 gap-2"><button disabled={busy!==''} onClick={()=>control({command:'JUDGE',teamId:x.team.id,verified:true,note:'Validated by trainer'},'ok'+x.team.id)} className="rounded-lg bg-emerald-500/15 px-2 py-2 font-semibold text-emerald-300 disabled:opacity-30">Verify</button><button disabled={busy!==''} onClick={()=>control({command:'JUDGE',teamId:x.team.id,verified:false,note:'Needs revision'},'no'+x.team.id)} className="rounded-lg bg-amber-500/15 px-2 py-2 font-semibold text-amber-300 disabled:opacity-30">Needs Revision</button></div>}</div>)}</div>}
   {feed?.verifiedLeaderboard&&feed.verifiedLeaderboard.length>0&&<div className="mt-3 space-y-1">{feed.verifiedLeaderboard.map(x=><div key={x.team.id} className="flex justify-between rounded-lg bg-white/5 px-3 py-2 text-xs"><span>#{x.rank} {x.team.name}</span><b>{mmss(x.elapsedSec)}</b></div>)}</div>}
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
