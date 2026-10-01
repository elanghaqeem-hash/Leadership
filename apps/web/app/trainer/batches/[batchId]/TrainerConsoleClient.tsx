'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import LiveGameTrainerPanel from './LiveGameTrainerPanel';
import ArenaTrainerPanel from './ArenaTrainerPanel';
import WarRoomTrainerPanel from './WarRoomTrainerPanel';
import DecisionAuctionTrainerPanel from './DecisionAuctionTrainerPanel';
import BoardroomTrainerPanel from './BoardroomTrainerPanel';
import CalendarTetrisTrainerPanel from './CalendarTetrisTrainerPanel';

type Activity={id:string;title:string;type:string;status:string;sequence:number;_count:{submissions:number;gameRounds:number}};
type Session={id:string;code:string;title:string;sequence:number;activities:Activity[]};
type Feed={batch:{id:string;code:string;name:string;joinCode:string;status:string};participantCount:number;teams:Array<{id:string;name:string;number:number;_count:{members:number}}>;sessions:Session[]};

const LIVE_GAME_TYPES=new Set(['LEADERSHIP_MIRROR','PRIORITY_POKER','FACT_OR_FICTION','BIAS_TRAP']);

function pill(status:string){
 if(status==='OPEN')return'bg-emerald-50 text-emerald-700';
 if(status==='LOCKED')return'bg-amber-50 text-amber-800';
 if(status==='REVEALED')return'bg-sky-50 text-sky-700';
 if(status==='CLOSED')return'bg-slate-200 text-slate-700';
 return'bg-slate-100 text-slate-500';
}

export default function TrainerConsoleClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[busy,setBusy]=useState('');
 async function load(){const r=await fetch(`/api/trainer/batches/${batchId}/session-control`,{cache:'no-store'});const d=await r.json();if(r.ok)setFeed(d);else setError(d.error||'Gagal memuat Trainer Console')}
 useEffect(()=>{load();const t=setInterval(load,2500);return()=>clearInterval(t)},[batchId]);
 async function control(activityId:string,action:'OPEN'|'LOCK'|'REVEAL'|'CLOSE'){setBusy(activityId+action);setError('');const r=await fetch(`/api/trainer/batches/${batchId}/session-control`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({activityId,action})});const d=await r.json();setBusy('');if(!r.ok){setError(d.error||'Gagal mengubah status');return;}await load()}
 const active=useMemo(()=>feed?.sessions.flatMap(s=>s.activities).find(a=>a.status==='OPEN')??null,[feed]);
 if(!feed)return <main className="min-h-screen bg-slate-950 p-5 text-white">{error||'Memuat Trainer Console…'}</main>;
 return <main className="min-h-screen bg-slate-950 text-white"><div className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/95 px-4 py-4 backdrop-blur"><div className="mx-auto flex max-w-7xl flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><div className="text-xs font-bold uppercase tracking-[.2em] text-amber-300">Trainer Console</div><h1 className="mt-1 text-2xl font-semibold">{feed.batch.name}</h1><div className="mt-1 text-sm text-slate-400">{feed.batch.code} · Join <b className="text-white">{feed.batch.joinCode}</b> · {feed.participantCount} peserta</div></div><div className="flex items-center gap-3"><div className="rounded-2xl bg-white/5 px-4 py-3 text-sm"><div className="text-xs uppercase tracking-wider text-slate-400">Aktivitas aktif</div><div className="mt-1 font-semibold text-emerald-300">{active?.title||'Belum ada'}</div></div><Link href={'/trainer/batches/'+batchId+'/projector'} target="_blank" className="rounded-xl bg-amber-300 px-4 py-3 text-sm font-bold text-slate-950">Projector ↗</Link></div></div></div><div className="mx-auto max-w-7xl px-4 py-6">{error&&<div className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-200 ring-1 ring-red-500/20">{error}</div>}<div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">{feed.teams.map(team=><div key={team.id} className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10"><div className="text-xs uppercase tracking-wider text-slate-400">Tim {team.number}</div><div className="mt-1 font-semibold">{team.name}</div><div className="mt-1 text-sm text-slate-400">{team._count.members} member</div></div>)}</div><div className="space-y-5">{feed.sessions.map(session=><section key={session.id} className="overflow-hidden rounded-2xl bg-white/5 ring-1 ring-white/10"><div className="border-b border-white/10 px-4 py-3"><div className="text-xs font-bold uppercase tracking-[.15em] text-slate-400">{session.code}</div><h2 className="mt-1 text-lg font-semibold">{session.title}</h2></div><div className="divide-y divide-white/10">{session.activities.map(a=><div key={a.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><div className="font-semibold">{a.title}</div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pill(a.status)}`}>{a.status}</span></div><div className="mt-1 text-xs text-slate-400">{a.type} · {a._count.submissions}/{feed.participantCount} submission</div>{LIVE_GAME_TYPES.has(a.type)&&a.status==='OPEN'&&<LiveGameTrainerPanel activityId={a.id} activityType={a.type}/>} {a.type==='ARENA'&&a.status==='OPEN'&&<ArenaTrainerPanel activityId={a.id}/>} {a.type==='WAR_ROOM'&&a.status==='OPEN'&&<WarRoomTrainerPanel activityId={a.id}/>} {a.type==='DECISION_AUCTION'&&a.status==='OPEN'&&<DecisionAuctionTrainerPanel activityId={a.id}/>} {a.type==='BOARDROOM'&&a.status==='OPEN'&&<BoardroomTrainerPanel activityId={a.id}/>} {a.type==='CALENDAR_TETRIS'&&a.status==='OPEN'&&<CalendarTetrisTrainerPanel activityId={a.id}/>}</div><div className="grid grid-cols-4 gap-2"><button disabled={busy!==''||a.status==='OPEN'} onClick={()=>control(a.id,'OPEN')} className="rounded-lg bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-300 disabled:opacity-30">Open</button><button disabled={busy!==''||!['OPEN','REVEALED'].includes(a.status)} onClick={()=>control(a.id,'LOCK')} className="rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-300 disabled:opacity-30">Lock</button><button disabled={busy!==''||!['OPEN','LOCKED','REVEALED'].includes(a.status)} onClick={()=>control(a.id,'REVEAL')} className="rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-300 disabled:opacity-30">Reveal</button><button disabled={busy!==''||a.status==='CLOSED'} onClick={()=>control(a.id,'CLOSE')} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-slate-200 disabled:opacity-30">Close</button></div></div>)}</div></section>)}</div></div></main>
}
