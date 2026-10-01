'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Card={no:number;topic:string};
type Feed={
  round:null|{phase:'RUNNING'|'CLOSED';tokenBudget:number;evidenceCost:number};
  cards:Card[];
  purchasedEvidence:Array<{no:number;topic:string;evidence:string}>;
  teamState:null|{purchased:number[];diagnosis:string;diagnosisCorrect?:boolean};
  teamStatus:null|{relevantEvidenceCount:number;remainingTokens:number;score:any};
  diagnosisKey:string|null;
};

export default function DetectiveRoomParticipant({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[diagnosis,setDiagnosis]=useState('');const[initialized,setInitialized]=useState(false);const[msg,setMsg]=useState('');const[busy,setBusy]=useState('');
 async function load(){const r=await fetch('/api/games/'+activityId+'/detective-room',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);if(!initialized){setDiagnosis(d.teamState?.diagnosis||'');setInitialized(true)}}else setMsg(d.error||'Gagal memuat Detective Room')}
 useEffect(()=>{void load()},[activityId,initialized]);
 useActivityRealtime(activityId,load,5000);
 const purchased=useMemo(()=>new Set(feed?.teamState?.purchased||[]),[feed?.teamState?.purchased]);
 async function buy(no:number){setBusy('buy'+no);const r=await fetch('/api/games/'+activityId+'/detective-room',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'BUY',evidenceNo:no})});const d=await r.json();setBusy('');if(!r.ok){setMsg(d.error||'Gagal membeli evidence');return;}setMsg('Evidence dibuka. Sisa token '+d.remainingTokens);await load()}
 async function submitDiagnosis(){setBusy('diagnosis');const r=await fetch('/api/games/'+activityId+'/detective-room',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'DIAGNOSIS',diagnosis})});const d=await r.json();setBusy('');if(!r.ok){setMsg(d.error||'Gagal mengirim diagnosis');return;}setMsg('Diagnosis tim tersimpan. Menunggu penilaian trainer.');await load()}
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{msg||'Memuat Detective Room…'}</div>;
 if(!feed.round)return <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Trainer belum memulai Detective Room.</div>;
 const round=feed.round;
 return <div className="mt-4 space-y-4">
   <div className="rounded-2xl bg-slate-950 p-4 text-white"><div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Detective Room</div><div className="mt-1 text-sm text-slate-300">TAT kredit naik 40% — beli evidence yang paling bernilai.</div></div><div className="text-right"><div className="text-xs uppercase text-slate-400">Token tersisa</div><div className="text-3xl font-bold text-amber-300">{feed.teamStatus?.remainingTokens??round.tokenBudget}</div></div></div></div>
   <div className="grid gap-3 sm:grid-cols-2">{feed.cards.map(card=><div key={card.no} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Evidence {card.no}</div><div className="mt-1 font-semibold text-navy">{card.topic}</div>{purchased.has(card.no)?<div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-900">{feed.purchasedEvidence.find(x=>x.no===card.no)?.evidence}</div>:<button disabled={busy!==''||round.phase!=='RUNNING'} onClick={()=>buy(card.no)} className="mt-3 w-full rounded-xl border border-teal px-3 py-2 text-sm font-semibold text-teal disabled:opacity-40">Beli · {round.evidenceCost} token</button>}</div>)}</div>
   <div className="rounded-2xl border border-slate-200 bg-white p-4"><label className="text-sm font-semibold text-navy">Diagnosis akar masalah<textarea disabled={round.phase!=='RUNNING'} value={diagnosis} onChange={e=>setDiagnosis(e.target.value)} placeholder="Tuliskan diagnosis tim berdasarkan evidence yang dibeli." className="mt-2 min-h-32 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"/></label><button disabled={busy!==''||round.phase!=='RUNNING'||diagnosis.trim().length<5} onClick={submitDiagnosis} className="mt-3 w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy==='diagnosis'?'Mengirim…':'Kirim Diagnosis Tim'}</button></div>
   {typeof feed.teamState?.diagnosisCorrect==='boolean'&&feed.teamStatus?.score&&<div className={`rounded-2xl p-4 ${feed.teamState.diagnosisCorrect?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-900'}`}><div className="font-semibold">{feed.teamState.diagnosisCorrect?'Diagnosis dinilai tepat':'Diagnosis belum tepat'}</div><div className="mt-1 text-sm">Score {feed.teamStatus.score.total} · Diagnosis {feed.teamStatus.score.diagnosisPoints} · Evidence {feed.teamStatus.score.evidencePoints} · Token {feed.teamStatus.score.tokenPoints}</div></div>}
   {feed.diagnosisKey&&<div className="rounded-2xl bg-sky-50 p-4 text-sm leading-6 text-sky-950"><b>Diagnosis key:</b> {feed.diagnosisKey}</div>}
   {msg&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg}</div>}
 </div>
}
