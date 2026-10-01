'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Card={id:string;kind:string;card:string};
type Placement={cardId:string;day:'Senin'|'Selasa'|'Rabu'|'Kamis'|'Jumat';startTime:string;note:string};
type Feed={
  cards:Card[];
  round:null|{phase:'PLANNING'|'CLOSED';sentDisruptions:number[]};
  disruptions:Array<{no:number;label:string;event:string}>;
  schedule:null|{placements?:Placement[]};
};

const days=['Senin','Selasa','Rabu','Kamis','Jumat'] as const;

export default function CalendarTetrisParticipant({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[rows,setRows]=useState<Placement[]>([]);const[initialized,setInitialized]=useState(false);const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/games/'+activityId+'/calendar-tetris',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);if(!initialized){const old=d.schedule?.placements||[];setRows((d.cards||[]).map((c:Card)=>old.find((x:Placement)=>x.cardId===c.id)||{cardId:c.id,day:'Senin',startTime:'08:00',note:''}));setInitialized(true)}}else setMsg(d.error||'Gagal memuat Calendar Tetris')}
 useEffect(()=>{void load()},[activityId,initialized]);
 useActivityRealtime(activityId,load,5000);
 async function save(){setBusy(true);const r=await fetch('/api/games/'+activityId+'/calendar-tetris',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({placements:rows})});const d=await r.json();setBusy(false);if(!r.ok){setMsg(d.error||'Gagal menyimpan kalender');return;}setMsg('Kalender tim tersimpan · versi '+d.version);await load()}
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{msg||'Memuat Calendar Tetris…'}</div>;
 if(!feed.round)return <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-600">Trainer belum memulai Calendar Tetris.</div>;
 return <div className="mt-4 space-y-4">
   {feed.disruptions.length>0&&<div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200"><div className="text-xs font-bold uppercase tracking-wider text-amber-800">Disrupsi</div><div className="mt-2 space-y-2">{feed.disruptions.map(d=><div key={d.no} className="rounded-xl bg-white/70 p-3 text-sm text-amber-950"><b>{d.label}:</b> {d.event}</div>)}</div></div>}
   <div className="space-y-3">{feed.cards.map(card=>{const row=rows.find(r=>r.cardId===card.id);if(!row)return null;return <div key={card.id} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{card.kind}</div><div className="mt-1 font-semibold text-navy">{card.card}</div><div className="mt-3 grid grid-cols-2 gap-2"><select disabled={feed.round?.phase!=='PLANNING'} value={row.day} onChange={e=>setRows(v=>v.map(x=>x.cardId===card.id?{...x,day:e.target.value as Placement['day']}:x))} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5">{days.map(d=><option key={d}>{d}</option>)}</select><input disabled={feed.round?.phase!=='PLANNING'} type="time" value={row.startTime} onChange={e=>setRows(v=>v.map(x=>x.cardId===card.id?{...x,startTime:e.target.value}:x))} className="rounded-xl border border-slate-300 px-3 py-2.5"/></div><input disabled={feed.round?.phase!=='PLANNING'} value={row.note} onChange={e=>setRows(v=>v.map(x=>x.cardId===card.id?{...x,note:e.target.value}:x))} placeholder="Catatan / respons atas disrupsi" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/></div>})}</div>
   <button disabled={busy||feed.round.phase!=='PLANNING'} onClick={save} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Menyimpan…':'Simpan Kalender Tim'}</button>
   {msg&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg}</div>}
 </div>
}
