'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Evidence={no:number;dimension:string;evidence:string};
type Answer={problemStatement:string;whys:string[];rootCause:string;evidenceNos:number[];countermeasure:string;verified?:boolean;reviewNote?:string};
type Feed={
 caseTitle:string;evidence:Evidence[];
 round:null|{phase:'RUNNING'|'CLOSED';startedAt:string;durationSec:number};
 answer:Answer|null;verifiedLeaderboard:null|Array<{team:{id:string;name:string;number:number};elapsedSec:number;rank:number}>;
};

function mmss(seconds:number){const m=Math.floor(seconds/60).toString().padStart(2,'0');const s=(seconds%60).toString().padStart(2,'0');return m+':'+s;}

export default function RootCauseRaceParticipant({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[answer,setAnswer]=useState<Answer>({problemStatement:'',whys:['','','','',''],rootCause:'',evidenceNos:[],countermeasure:''});const[initialized,setInitialized]=useState(false);const[now,setNow]=useState(Date.now());const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/games/'+activityId+'/root-cause-race',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);if(!initialized&&d.answer){setAnswer(d.answer);setInitialized(true)}}else setMsg(d.error||'Gagal memuat Root Cause Race')}
 useEffect(()=>{void load();const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t)},[activityId,initialized]);
 useActivityRealtime(activityId,load,5000);
 const remaining=useMemo(()=>{if(!feed?.round)return 0;return Math.max(0,feed.round.durationSec-Math.floor((now-new Date(feed.round.startedAt).getTime())/1000))},[feed?.round,now]);
 async function submit(){setBusy(true);const r=await fetch('/api/games/'+activityId+'/root-cause-race',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(answer)});const d=await r.json();setBusy(false);if(!r.ok){setMsg(d.error||'Gagal mengirim analisis');return;}setMsg('Analisis tim tersimpan. Menunggu verifikasi trainer.');await load()}
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{msg||'Memuat Root Cause Race…'}</div>;
 if(!feed.round)return <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Trainer belum memulai Root Cause Race.</div>;
 const running=feed.round.phase==='RUNNING'&&remaining>0;
 return <div className="mt-4 space-y-4">
   <div className="rounded-2xl bg-slate-950 p-5 text-white"><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Root Cause Race</div><div className="mt-1 text-lg font-semibold">{feed.caseTitle}</div></div><div className={`font-mono text-4xl font-bold ${remaining<=60?'text-red-300':'text-white'}`}>{mmss(remaining)}</div></div></div>
   <div className="grid gap-2 sm:grid-cols-2">{feed.evidence.map(e=><button type="button" key={e.no} disabled={!running} onClick={()=>setAnswer(v=>({...v,evidenceNos:v.evidenceNos.includes(e.no)?v.evidenceNos.filter(x=>x!==e.no):[...v.evidenceNos,e.no]}))} className={`rounded-xl p-3 text-left text-sm ring-1 ${answer.evidenceNos.includes(e.no)?'bg-teal text-white ring-teal':'bg-white text-slate-800 ring-slate-200'}`}><div className="text-xs font-bold uppercase opacity-70">{e.dimension}</div><div className="mt-1">{e.evidence}</div></button>)}</div>
   <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
     <label className="block text-sm font-semibold">Problem Statement<textarea disabled={!running} value={answer.problemStatement} onChange={e=>setAnswer(v=>({...v,problemStatement:e.target.value}))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2"/></label>
     {answer.whys.map((w,i)=><label key={i} className="block text-sm font-semibold">Why {i+1}<textarea disabled={!running} value={w} onChange={e=>setAnswer(v=>({...v,whys:v.whys.map((x,j)=>j===i?e.target.value:x)}))} className="mt-1 min-h-16 w-full rounded-xl border border-slate-300 px-3 py-2"/></label>)}
     <label className="block text-sm font-semibold">Root Cause<textarea disabled={!running} value={answer.rootCause} onChange={e=>setAnswer(v=>({...v,rootCause:e.target.value}))} className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"/></label>
     <label className="block text-sm font-semibold">Countermeasure<textarea disabled={!running} value={answer.countermeasure} onChange={e=>setAnswer(v=>({...v,countermeasure:e.target.value}))} className="mt-1 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2"/></label>
     <button disabled={!running||busy||answer.problemStatement.trim().length<5||answer.rootCause.trim().length<5||answer.countermeasure.trim().length<5||answer.evidenceNos.length===0||answer.whys.some(x=>!x.trim())} onClick={submit} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Mengirim…':'Submit Analisis Tim'}</button>
   </div>
   {typeof feed.answer?.verified==='boolean'&&<div className={`rounded-xl p-3 text-sm ${feed.answer.verified?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`}><b>{feed.answer.verified?'Verified':'Needs revision'}</b>{feed.answer.reviewNote?' · '+feed.answer.reviewNote:''}</div>}
   {feed.verifiedLeaderboard&&<div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="font-semibold text-navy">Verified Finishers</div><div className="mt-3 space-y-2">{feed.verifiedLeaderboard.map(x=><div key={x.team.id} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>#{x.rank} {x.team.name}</span><b>{mmss(x.elapsedSec)}</b></div>)}</div></div>}
   {msg&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg}</div>}
 </div>
}
