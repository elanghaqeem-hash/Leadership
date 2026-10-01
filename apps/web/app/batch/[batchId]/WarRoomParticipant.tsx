'use client';

import { useEffect, useState } from 'react';

const COLS=['Priority','Decision','Delegation','Escalation','Communication','Action'] as const;
type Col=typeof COLS[number];
type Feed={
  initialConditions:Array<{no:number;condition:string}>;
  round:null|{phase:'RUNNING'|'CLOSED';sentEventNos:number[]};
  events:Array<{no:number;event:string}>;
  board:null|{payload:{columns?:Record<Col,string[]>};version:number;updatedAt:string};
  leaderboard:null|Array<{team:{id:string;name:string;number:number};total:number;rank:number;weakestDimension:string|null;scoredDimensions:number}>;
};

const empty=()=>Object.fromEntries(COLS.map(c=>[c,''])) as Record<Col,string>;

export default function WarRoomParticipant({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[columns,setColumns]=useState<Record<Col,string>>(empty);const[initialized,setInitialized]=useState(false);const[dirty,setDirty]=useState(false);const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/games/'+activityId+'/war-room',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);if(!initialized&&!dirty){const source=d.board?.payload?.columns||{};setColumns(Object.fromEntries(COLS.map(c=>[c,Array.isArray(source[c])?source[c].join('\n'):''])) as Record<Col,string>);setInitialized(true)}}else setMsg(d.error||'Gagal memuat War Room')}
 useEffect(()=>{void load();const t=setInterval(()=>void load(),1500);return()=>clearInterval(t)},[activityId,initialized,dirty]);
 async function save(){setBusy(true);setMsg('');const payload={columns:Object.fromEntries(COLS.map(c=>[c,columns[c].split('\n').map(x=>x.trim()).filter(Boolean)]))};const r=await fetch('/api/games/'+activityId+'/war-room',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});const d=await r.json();setBusy(false);if(!r.ok){setMsg(d.error||'Gagal menyimpan board');return;}setDirty(false);setMsg('Board tim tersimpan · versi '+d.version);await load()}
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{msg||'Memuat War Room…'}</div>;
 return <div className="mt-4 space-y-4">
   <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><div className="text-xs font-bold uppercase tracking-wider text-slate-500">Kondisi awal</div><div className="mt-3 grid gap-2 sm:grid-cols-2">{feed.initialConditions.map(x=><div key={x.no} className="rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200"><b>{x.no}.</b> {x.condition}</div>)}</div></div>
   {feed.events.length>0&&<div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200"><div className="text-xs font-bold uppercase tracking-wider text-amber-800">Event masuk</div><div className="mt-3 space-y-2">{feed.events.map(x=><div key={x.no} className="rounded-xl bg-white/70 p-3 text-sm text-amber-950"><b>Event {x.no}:</b> {x.event}</div>)}</div></div>}
   {!feed.round?<div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500">Trainer belum memulai War Room.</div>:<div className="space-y-3">
     <div className="flex items-center justify-between"><div className="font-semibold text-navy">Papan Tim — 6 Kolom</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${feed.round.phase==='RUNNING'?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-600'}`}>{feed.round.phase}</span></div>
     <div className="grid gap-3 sm:grid-cols-2">{COLS.map(col=><label key={col} className="block rounded-2xl border border-slate-200 bg-white p-3"><span className="text-sm font-bold text-navy">{col}</span><textarea disabled={feed.round?.phase!=='RUNNING'} value={columns[col]} onChange={e=>{setColumns(v=>({...v,[col]:e.target.value}));setDirty(true)}} placeholder="1 item per baris" className="mt-2 min-h-28 w-full resize-y rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"/></label>)}</div>
     <button disabled={busy||feed.round.phase!=='RUNNING'||!dirty} onClick={save} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Menyimpan…':'Simpan Papan Tim'}</button>
   </div>}
   {feed.leaderboard&&<div className="rounded-2xl border border-slate-200 bg-white p-4"><div className="font-semibold text-navy">Final War Room Ranking</div><div className="mt-3 space-y-2">{feed.leaderboard.map(x=><div key={x.team.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm"><span>#{x.rank} {x.team.name}</span><b>{Math.round(x.total)} / 100</b></div>)}</div></div>}
   {msg&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg}</div>}
 </div>
}
