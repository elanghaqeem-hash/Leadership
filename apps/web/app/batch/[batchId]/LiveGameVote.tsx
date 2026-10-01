'use client';

import { useEffect, useMemo, useState } from 'react';

type LiveFeed={
  activity:{id:string;type:string;title:string;status:string};
  round:null|{id:string;roundNo:number;cardNo:number;stage:'BASE'|'TWIST';phase:'VOTING'|'REVEALED'|'CLOSED'};
  card?:Record<string,any>|null;
  choices:string[];
  myVote?:string|null;
  totalVotes?:number;
  aggregate?:Record<string,number>|null;
  answer?:any;
};

function promptFor(feed:LiveFeed){
  if(!feed.card)return '';
  if(feed.activity.type==='LEADERSHIP_MIRROR')return feed.card.situation||'';
  if(feed.activity.type==='PRIORITY_POKER')return feed.card.prompt||'';
  if(feed.activity.type==='FACT_OR_FICTION')return feed.card.statement||'';
  if(feed.activity.type==='BIAS_TRAP')return feed.card.prompt||'';
  return '';
}

export default function LiveGameVote({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<LiveFeed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState(false);
 async function load(){const r=await fetch(`/api/games/${activityId}/live`,{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat game')}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),1500);return()=>clearInterval(t)},[activityId]);
 async function vote(choice:string){setBusy(true);setError('');const r=await fetch(`/api/games/${activityId}/live`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({choice})});const d=await r.json();setBusy(false);if(!r.ok){setError(d.error||'Vote gagal');return;}await load()}
 const maxCount=useMemo(()=>feed?.aggregate?Math.max(1,...Object.values(feed.aggregate)):1,[feed?.aggregate]);
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{error||'Menunggu game…'}</div>;
 if(!feed.round)return <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Trainer belum memulai round.</div>;
 const revealed=feed.round.phase==='REVEALED'||feed.round.phase==='CLOSED';
 const options=feed.activity.type==='LEADERSHIP_MIRROR'?(feed.card?.options||{}):null;
 return <div className="mt-4 space-y-4">
   <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
     <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Round {feed.round.roundNo} · Kartu {feed.round.cardNo}{feed.round.stage==='TWIST'?' · TWIST':''}</div>
     <div className="mt-2 text-base font-semibold leading-6 text-navy">{promptFor(feed)}</div>
     {feed.round.stage==='TWIST'&&feed.card?.twistPrompt&&<div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Twist: {feed.card.twistPrompt}</div>}
   </div>
   {options&&<div className="space-y-2">{Object.entries(options).map(([key,value])=><div key={key} className="rounded-xl border border-slate-200 bg-white p-3 text-sm"><b>{key}.</b> {String(value)}</div>)}</div>}
   {feed.round.phase==='VOTING'&&<div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{feed.choices.map(choice=><button key={choice} disabled={busy} onClick={()=>vote(choice)} className={`rounded-xl px-3 py-3 text-sm font-bold ring-1 transition ${feed.myVote===choice?'bg-teal text-white ring-teal':'bg-white text-navy ring-slate-200 hover:ring-teal'}`}>{choice}</button>)}</div>}
   {feed.myVote&&<div className="text-sm text-slate-600">Pilihan Anda: <b>{feed.myVote}</b>{!revealed?' · menunggu reveal trainer':''}</div>}
   {!revealed&&<div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">{feed.totalVotes??0} vote sudah masuk. Distribusi disembunyikan sampai Reveal.</div>}
   {revealed&&<div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="font-semibold text-navy">Hasil kelas</div>
      {feed.choices.map(choice=>{const n=feed.aggregate?.[choice]??0;return <div key={choice}><div className="flex justify-between text-sm"><span>{choice}</span><b>{n}</b></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-teal" style={{width:`${Math.round(n/maxCount*100)}%`}}/></div></div>})}
      {feed.answer?.expected&&<div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900"><b>Expected:</b> {String(feed.answer.expected)}</div>}
      {feed.answer?.additionalData&&<div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900"><b>Data tambahan:</b> {String(feed.answer.additionalData)}</div>}
      {feed.answer?.betterQuestion&&<div className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900"><b>Better question:</b> {String(feed.answer.betterQuestion)}</div>}
   </div>}
   {error&&<div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
 </div>
}
