'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Program={id:string;name:string;cost:number;benefit:number;risk:number;uncertainty:number};
type Feed={
  round:null|{round:string;phase:'CHOOSING'|'CLOSED'};
  programs:Program[];
  budget:number;
  maxActive:number;
  roundInfo:string|null;
  mySelection?:string[];
  myStatus?:{cost:number;count:number;withinBudget:boolean;withinMax:boolean;valid:boolean};
  leaderboard?:Array<{team:{id:string;name:string;number:number};complete:boolean;rank:number|null;score:any}>|null;
};

export default function DecisionAuctionParticipant({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[selected,setSelected]=useState<string[]>([]);const[initialized,setInitialized]=useState(false);const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/games/'+activityId+'/decision-auction',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);if(!initialized){setSelected(d.mySelection||[]);setInitialized(true)}}else setMsg(d.error||'Gagal memuat Decision Auction')}
 useEffect(()=>{void load()},[activityId,initialized]);
 useActivityRealtime(activityId,load,5000);
 useEffect(()=>{if(feed?.round?.phase==='CHOOSING')setSelected(feed.mySelection||[])},[feed?.round?.round]);
 const status=useMemo(()=>{if(!feed)return null;const programs=feed.programs.filter(p=>selected.includes(p.id));const cost=programs.reduce((s,p)=>s+p.cost,0);return{cost,count:programs.length,valid:cost<=feed.budget&&programs.length<=feed.maxActive}},[feed,selected]);
 async function save(){setBusy(true);const r=await fetch('/api/games/'+activityId+'/decision-auction',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({activeProgramIds:selected})});const d=await r.json();setBusy(false);if(!r.ok){setMsg(d.error||'Gagal menyimpan pilihan');return;}setMsg(d.status?.valid?'Pilihan tim tersimpan.':'Pilihan tersimpan tetapi melanggar batas; NET final dapat menjadi 0.');await load()}
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{msg||'Memuat Decision Auction…'}</div>;
 if(!feed.round)return <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Trainer belum memulai round.</div>;
 return <div className="mt-4 space-y-4">
   <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><div className="flex items-center justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Decision Auction</div><div className="mt-1 text-xl font-semibold text-navy">{feed.round.round}</div></div><div className="text-right text-sm"><div>Budget <b>{feed.budget}</b></div><div>Max <b>{feed.maxActive}</b> program</div></div></div>{feed.roundInfo&&<div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">{feed.roundInfo}</div>}</div>
   <div className="grid gap-3 sm:grid-cols-2">{feed.programs.map(p=>{const on=selected.includes(p.id);return <button type="button" key={p.id} disabled={feed.round?.phase!=='CHOOSING'} onClick={()=>setSelected(v=>on?v.filter(x=>x!==p.id):[...v,p.id])} className={`rounded-2xl p-4 text-left ring-1 transition ${on?'bg-teal text-white ring-teal':'bg-white text-slate-900 ring-slate-200'}`}><div className="font-semibold">{p.name}</div><div className={`mt-2 grid grid-cols-2 gap-1 text-xs ${on?'text-white/80':'text-slate-500'}`}><span>Cost {p.cost}</span><span>Benefit {p.benefit}</span><span>Risk {p.risk}</span><span>Uncertainty {p.uncertainty}</span></div></button>})}</div>
   {status&&<div className={`rounded-xl p-3 text-sm ${status.valid?'bg-emerald-50 text-emerald-900':'bg-red-50 text-red-800'}`}>Selected {status.count} program · Cost <b>{status.cost}</b> / {feed.budget}{!status.valid?' · melanggar limit':''}</div>}
   {feed.round.phase==='CHOOSING'&&<button disabled={busy} onClick={save} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Menyimpan…':'Kunci Pilihan Tim'}</button>}
   {feed.round.phase==='CLOSED'&&!feed.leaderboard&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Round ditutup. Menunggu trainer membuka round berikutnya.</div>}
   {feed.leaderboard&&<div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="font-semibold text-navy">Final Decision Auction</div><div className="mt-3 space-y-2">{feed.leaderboard.filter(x=>x.complete).map(x=><div key={x.team.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>#{x.rank} {x.team.name}</span><b>NET {Math.round(x.score?.net||0)}</b></div>)}</div></div>}
   {msg&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg}</div>}
 </div>
}
