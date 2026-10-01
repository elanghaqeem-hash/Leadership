'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type TeamRow={team:{id:string;name:string;number:number};state:{purchased:number[];diagnosis:string;diagnosisCorrect?:boolean};remainingTokens:number;score:any;rank:number|null};
type Feed={
  round:null|{phase:'RUNNING'|'CLOSED';tokenBudget:number;evidenceCost:number};
  diagnosisKey:string|null;
  teams:TeamRow[]|null;
};

export default function DetectiveRoomTrainerPanel({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');const[tokenBudget,setTokenBudget]=useState('');const[evidenceCost,setEvidenceCost]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/detective-room',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat Detective Room')}
 useEffect(()=>{void load()},[activityId]);
 useActivityRealtime(activityId,load,5000);
 async function control(body:any,key:string){setBusy(key);const r=await fetch('/api/games/'+activityId+'/detective-room',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Kontrol Detective Room gagal');return;}await load()}
 const startDisabled=busy!==''||Boolean(feed?.round&&feed.round.phase==='RUNNING')||Number(tokenBudget)<1||Number(evidenceCost)<1;
 return <div className="mt-3 rounded-xl bg-black/20 p-3 ring-1 ring-white/10">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Detective Room Control</div><div className="mt-1 text-sm font-semibold">{feed?.round?feed.round.phase+' · budget '+feed.round.tokenBudget+' · cost '+feed.round.evidenceCost:'Set token sebelum mulai'}</div></div>{!feed?.round||feed.round.phase==='CLOSED'?<div className="flex gap-2"><input type="number" min="1" value={tokenBudget} onChange={e=>setTokenBudget(e.target.value)} placeholder="Token" className="w-20 rounded-lg bg-white/10 px-2 py-2 text-xs text-white ring-1 ring-white/10"/><input type="number" min="1" value={evidenceCost} onChange={e=>setEvidenceCost(e.target.value)} placeholder="Cost" className="w-20 rounded-lg bg-white/10 px-2 py-2 text-xs text-white ring-1 ring-white/10"/><button disabled={startDisabled} onClick={()=>control({command:'START',tokenBudget:Number(tokenBudget),evidenceCost:Number(evidenceCost)},'start')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Start</button></div>:<button disabled={busy!==''} onClick={()=>control({command:'CLOSE'},'close')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Close</button>}</div>
   <div className="mt-2 text-[11px] leading-4 text-slate-500">Token budget dan cost per evidence sengaja trainer-configurable karena workbook sumber tidak menetapkan nilainya.</div>
   {feed?.diagnosisKey&&<div className="mt-3 rounded-lg bg-sky-500/10 p-3 text-xs leading-5 text-sky-200"><b>Diagnosis key:</b> {feed.diagnosisKey}</div>}
   {feed?.teams&&<div className="mt-3 space-y-2">{feed.teams.map(x=><div key={x.team.id} className="rounded-lg bg-white/5 p-3 text-xs"><div className="flex items-center justify-between gap-3"><span className="font-semibold">{x.team.name}</span><span>{x.state.purchased.length} evidence · {x.remainingTokens} token{x.score?' · '+x.score.total+' pts':''}</span></div><div className="mt-2 text-slate-300">{x.state.diagnosis||'Belum ada diagnosis'}</div><div className="mt-2 grid grid-cols-2 gap-2"><button disabled={busy!==''||!x.state.diagnosis} onClick={()=>control({command:'JUDGE',teamId:x.team.id,correct:true},'judge'+x.team.id)} className="rounded-lg bg-emerald-500/15 px-2 py-2 font-semibold text-emerald-300 disabled:opacity-30">Diagnosis Correct</button><button disabled={busy!==''||!x.state.diagnosis} onClick={()=>control({command:'JUDGE',teamId:x.team.id,correct:false},'judge'+x.team.id+'x')} className="rounded-lg bg-amber-500/15 px-2 py-2 font-semibold text-amber-300 disabled:opacity-30">Needs Revision</button></div></div>)}</div>}
   {error&&<div className="mt-2 rounded-lg bg-red-500/10 p-2 text-xs text-red-200">{error}</div>}
 </div>
}
