'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import StructuredTools, { STRUCTURED_TYPES } from './StructuredTools';
import LiveGameVote from './LiveGameVote';
import ArenaParticipant from './ArenaParticipant';
import WarRoomParticipant from './WarRoomParticipant';
import DecisionAuctionParticipant from './DecisionAuctionParticipant';
import BoardroomParticipant from './BoardroomParticipant';
import CalendarTetrisParticipant from './CalendarTetrisParticipant';
import DelegationRelay from './DelegationRelay';

type Activity = {
  id:string;
  type:string;
  title:string;
  sequence:number;
  status:'DRAFT'|'OPEN'|'LOCKED'|'REVEALED'|'CLOSED';
  openedAt?:string|null;
  config:any;
  session:{code:string;title:string;sequence:number}|null;
  submission:any;
  testAttempt?:{kind:string;score:number;startedAt:string;submittedAt:string|null}|null;
};
type Feed = {
  batch:{id:string;code:string;name:string;status:string;startDate:string;endDate:string};
  membership:{role:string;teamId:string|null}|null;
  content:Record<string,{code:string;title:string;payload:any}>;
  activities:Activity[];
};

const dimensionLabels:Record<string,string>={
  'Priority Management':'Priority Management',
  'Time Management':'Time Management',
  Focus:'Focus',
  Delegation:'Delegation',
  'Critical Thinking':'Critical Thinking',
  'Decision Making':'Decision Making',
  Communication:'Communication',
  Accountability:'Accountability',
  Coaching:'Coaching',
  Execution:'Execution',
};

async function postSubmission(activityId:string,payload:unknown){
  const r=await fetch(`/api/activities/${activityId}/submission`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payload})});
  const d=await r.json();
  if(!r.ok)throw new Error(d.error||'Gagal menyimpan jawaban');
  return d;
}

function StatusPill({status,done}:{status:string;done:boolean}){
  const text=done?'Selesai':status==='OPEN'?'Terbuka':status==='LOCKED'?'Dikunci':status==='REVEALED'?'Reveal':status==='CLOSED'?'Ditutup':'Belum dibuka';
  return <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${done?'bg-emerald-50 text-emerald-700':status==='OPEN'?'bg-teal/10 text-teal':'bg-slate-100 text-slate-500'}`}>{text}</span>;
}

function SelfDiagnostic({activity,content,onSaved}:{activity:Activity;content:any;onSaved:()=>void}){
  const dimensions:string[]=content?.payload?.dimensions||Object.keys(dimensionLabels);
  const existing=(activity.submission?.payload?.ratings||{}) as Record<string,number>;
  const [ratings,setRatings]=useState<Record<string,number>>(()=>Object.fromEntries(dimensions.map(d=>[d,existing[d]||3])));
  const [message,setMessage]=useState('');
  const [loading,setLoading]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setLoading(true);setMessage('');try{await postSubmission(activity.id,{ratings});setMessage('Tersimpan.');onSaved();}catch(e){setMessage(e instanceof Error?e.message:'Gagal menyimpan');}finally{setLoading(false)}}
  return <form onSubmit={submit} className="mt-4 space-y-4">
    <div className="space-y-3">{dimensions.map(d=><div key={d} className="rounded-xl bg-slate-50 p-3"><div className="flex items-center justify-between gap-3"><label className="text-sm font-medium">{d}</label><span className="min-w-9 rounded-lg bg-white px-2 py-1 text-center font-semibold ring-1 ring-slate-200">{ratings[d]}</span></div><input aria-label={d} type="range" min="1" max="5" step="1" value={ratings[d]} onChange={e=>setRatings(v=>({...v,[d]:Number(e.target.value)}))} className="mt-3 w-full accent-teal"/></div>)}</div>
    {message&&<p className="text-sm text-slate-600">{message}</p>}<button disabled={loading} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-50">{loading?'Menyimpan…':'Simpan Self-Diagnostic'}</button>
  </form>
}

type PriorityRow={id:string;activity:string;urgency:number;business:number;customer:number;risk:number;compliance:number;strategic:number};
const newPriority=():PriorityRow=>({id:crypto.randomUUID(),activity:'',urgency:3,business:3,customer:3,risk:3,compliance:3,strategic:3});
function PriorityScorecard({activity,onSaved}:{activity:Activity;onSaved:()=>void}){
  const existing=(activity.submission?.payload?.items||[]) as PriorityRow[];
  const [rows,setRows]=useState<PriorityRow[]>(existing.length?existing:[newPriority()]);
  const [message,setMessage]=useState('');
  const fields:[keyof PriorityRow,string][]=[['urgency','Urgency'],['business','Business'],['customer','Customer'],['risk','Risk'],['compliance','Compliance'],['strategic','Strategic']];
  async function submit(e:FormEvent){e.preventDefault();try{await postSubmission(activity.id,{items:rows});setMessage('Scorecard tersimpan.');onSaved();}catch(e){setMessage(e instanceof Error?e.message:'Gagal menyimpan')}}
  return <form onSubmit={submit} className="mt-4 space-y-4">
    {rows.map((row,idx)=><div key={row.id} className="rounded-xl border border-slate-200 p-3"><div className="flex items-center justify-between"><div className="text-sm font-semibold">Aktivitas {idx+1}</div>{rows.length>1&&<button type="button" onClick={()=>setRows(rows.filter(r=>r.id!==row.id))} className="text-xs font-semibold text-red-600">Hapus</button>}</div><input value={row.activity} onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,activity:e.target.value}:r))} required placeholder="Contoh: Review laporan regulator" className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5"/><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{fields.map(([key,label])=><label key={String(key)} className="text-xs font-medium text-slate-600">{label}<select value={row[key] as number} onChange={e=>setRows(rows.map(r=>r.id===row.id?{...r,[key]:Number(e.target.value)}:r))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2">{[1,2,3,4,5].map(v=><option key={v} value={v}>{v}</option>)}</select></label>)}</div></div>)}
    <button type="button" onClick={()=>setRows([...rows,newPriority()])} className="w-full rounded-xl border border-teal px-4 py-2.5 font-semibold text-teal">+ Tambah aktivitas</button>
    {message&&<p className="text-sm text-slate-600">{message}</p>}<button className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white">Hitung & Simpan Priority</button>
  </form>
}

type Slot={id:string;day:string;time:string;category:string;note:string};
const categories=['Focus','Meeting','Customer','People/Coaching','Admin/Batch','Buffer','Break'];
const newSlot=():Slot=>({id:crypto.randomUUID(),day:'Senin',time:'08:00',category:'Focus',note:''});
function WeeklyPlanner({activity,onSaved}:{activity:Activity;onSaved:()=>void}){
 const existing=((activity.submission?.payload?.slots||[]) as any[]).map(s=>({...s,id:crypto.randomUUID()}));
 const[slots,setSlots]=useState<Slot[]>(existing.length?existing:[newSlot()]);const[msg,setMsg]=useState('');
 async function submit(e:FormEvent){e.preventDefault();try{await postSubmission(activity.id,{slots:slots.map(({id,...s})=>s)});setMsg('Weekly Planner tersimpan.');onSaved();}catch(e){setMsg(e instanceof Error?e.message:'Gagal menyimpan')}}
 return <form onSubmit={submit} className="mt-4 space-y-3">{slots.map((s,i)=><div key={s.id} className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 p-3"><select value={s.day} onChange={e=>setSlots(slots.map(x=>x.id===s.id?{...x,day:e.target.value}:x))} className="rounded-lg border border-slate-300 px-2 py-2">{['Senin','Selasa','Rabu','Kamis','Jumat'].map(d=><option key={d}>{d}</option>)}</select><input type="time" value={s.time} onChange={e=>setSlots(slots.map(x=>x.id===s.id?{...x,time:e.target.value}:x))} className="rounded-lg border border-slate-300 px-2 py-2"/><select value={s.category} onChange={e=>setSlots(slots.map(x=>x.id===s.id?{...x,category:e.target.value}:x))} className="rounded-lg border border-slate-300 px-2 py-2">{categories.map(x=><option key={x}>{x}</option>)}</select><div className="flex gap-2"><input value={s.note} onChange={e=>setSlots(slots.map(x=>x.id===s.id?{...x,note:e.target.value}:x))} placeholder="Catatan" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-2"/>{slots.length>1&&<button type="button" onClick={()=>setSlots(slots.filter(x=>x.id!==s.id))} className="px-2 text-red-600">×</button>}</div></div>)}<button type="button" onClick={()=>setSlots([...slots,newSlot()])} className="w-full rounded-xl border border-teal px-4 py-2.5 font-semibold text-teal">+ Tambah slot 30 menit</button>{msg&&<p className="text-sm text-slate-600">{msg}</p>}<button className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white">Simpan Weekly Planner</button></form>
}

function TestRunner({batchId,activity,onSaved}:{batchId:string;activity:Activity;onSaved:()=>void}){
 const kind=activity.type==='PRE_TEST'?'PRE':'POST'; const[data,setData]=useState<any>(null);const[answers,setAnswers]=useState<Record<string,string>>({});const[msg,setMsg]=useState('');const[remaining,setRemaining]=useState<number|null>(null);
 async function start(){setMsg('');const r=await fetch(`/api/batches/${batchId}/test/${kind.toLowerCase()}`);const d=await r.json();if(!r.ok){setMsg(d.error||'Gagal memulai test');return;}setData(d);setAnswers(d.attempt.responses||{});setRemaining(d.attempt.remainingSec);if(d.attempt.submittedAt)onSaved();}
 useEffect(()=>{if(remaining===null||remaining<=0||data?.attempt?.submittedAt)return;const t=setInterval(()=>setRemaining(v=>v===null?null:Math.max(0,v-1)),1000);return()=>clearInterval(t)},[remaining,data?.attempt?.submittedAt]);
 useEffect(()=>{if(remaining===0&&data&&!data.attempt?.submittedAt)void submit()},[remaining]);
 async function submit(){const r=await fetch(`/api/batches/${batchId}/test/${kind.toLowerCase()}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({answers})});const d=await r.json();if(!r.ok){setMsg(d.error||'Gagal mengirim test');return;}setData((x:any)=>({...x,attempt:{...x.attempt,submittedAt:d.submittedAt,score:d.score}}));setMsg(`Skor: ${d.score}/${d.maxScore}${d.gain===null?'':` · Gain ${d.gain>=0?'+':''}${d.gain}`}`);onSaved();}
 if(!data)return <div className="mt-4"><button onClick={start} disabled={activity.status!=='OPEN'} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">Mulai {kind==='PRE'?'Pre-Test':'Post-Test'}</button>{msg&&<p className="mt-2 text-sm text-red-600">{msg}</p>}</div>;
 if(data.attempt.submittedAt)return <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">Test selesai · Skor {data.attempt.score}</div>;
 return <div className="mt-4 space-y-5"><div className="sticky top-2 z-10 flex items-center justify-between rounded-xl bg-navy px-4 py-3 text-white shadow"><span className="text-sm font-semibold">20 soal</span><span className="font-mono text-lg">{Math.floor((remaining??0)/60).toString().padStart(2,'0')}:{((remaining??0)%60).toString().padStart(2,'0')}</span></div>{data.questions.map((q:any,idx:number)=><fieldset key={q.code} className="rounded-xl border border-slate-200 p-4"><legend className="px-1 text-sm font-semibold">{idx+1}. {q.prompt}</legend><div className="mt-3 space-y-2">{Object.entries(q.options as Record<string,string>).map(([key,value])=><label key={key} className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm"><input type="radio" name={q.code} value={key} checked={answers[q.code]===key} onChange={()=>setAnswers({...answers,[q.code]:key})}/><span><b>{key}.</b> {value}</span></label>)}</div></fieldset>)}{msg&&<p className="text-sm font-semibold text-slate-700">{msg}</p>}{remaining===0&&<p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">Waktu habis. Jawaban sedang dikirim otomatis.</p>}<button onClick={submit} disabled={remaining===0} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-50">Kirim Jawaban</button></div>
}

const LIVE_GAME_TYPES=new Set(['LEADERSHIP_MIRROR','PRIORITY_POKER','FACT_OR_FICTION','BIAS_TRAP']);

function ActivityBody({batchId,activity,content,onSaved}:{batchId:string;activity:Activity;content:any;onSaved:()=>void}){
 if(activity.type==='SELF_DIAGNOSTIC')return <SelfDiagnostic activity={activity} content={content} onSaved={onSaved}/>;
 if(LIVE_GAME_TYPES.has(activity.type))return <LiveGameVote activityId={activity.id}/>;
 if(activity.type==='ARENA')return <ArenaParticipant activityId={activity.id}/>;
 if(activity.type==='WAR_ROOM')return <WarRoomParticipant activityId={activity.id}/>;
 if(activity.type==='DECISION_AUCTION')return <DecisionAuctionParticipant activityId={activity.id}/>;
 if(activity.type==='BOARDROOM')return <BoardroomParticipant activityId={activity.id}/>;
 if(activity.type==='CALENDAR_TETRIS')return <CalendarTetrisParticipant activityId={activity.id}/>;
 if(activity.type==='DELEGATION_RELAY')return <DelegationRelay activity={activity} content={content}/>;
 if(activity.type==='PRE_TEST'||activity.type==='POST_TEST')return <TestRunner batchId={batchId} activity={activity} onSaved={onSaved}/>;
 if(activity.type==='PRIORITY_SCORECARD')return <PriorityScorecard activity={activity} onSaved={onSaved}/>;
 if(activity.type==='WEEKLY_PLANNER')return <WeeklyPlanner activity={activity} onSaved={onSaved}/>;
 if(STRUCTURED_TYPES.has(activity.type))return <StructuredTools activity={activity} save={(payload)=>postSubmission(activity.id,payload)} onSaved={onSaved}/>;
 return <p className="mt-3 text-sm leading-6 text-slate-500">{activity.status==='OPEN'?'Form aktivitas ini sedang dilengkapi pada Sprint 2.':'Aktivitas akan dibuka oleh trainer sesuai urutan sesi.'}</p>;
}

export default function ParticipantBatchClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');const[loading,setLoading]=useState(true);
 async function load(){setLoading(true);const r=await fetch(`/api/batches/${batchId}/activities`,{cache:'no-store'});const d=await r.json();if(!r.ok){setError(d.error||'Gagal memuat aktivitas');setLoading(false);return;}setFeed(d);setLoading(false)}
 useEffect(()=>{load()},[batchId]);
 const progress=useMemo(()=>{if(!feed)return{done:0,total:0};const relevant=feed.activities.filter(a=>a.status!=='DRAFT');return{done:relevant.filter(a=>Boolean(a.submission)||Boolean(a.testAttempt?.submittedAt)).length,total:relevant.length}},[feed]);
 if(loading)return <main className="min-h-screen bg-slate-50 p-4"><div className="mx-auto max-w-3xl animate-pulse space-y-4"><div className="h-28 rounded-3xl bg-slate-200"/><div className="h-40 rounded-2xl bg-slate-200"/></div></main>;
 if(!feed)return <main className="p-6 text-red-700">{error||'Data tidak tersedia'}</main>;
 return <main className="min-h-screen bg-slate-50 px-4 py-5 sm:py-8"><div className="mx-auto max-w-3xl"><header className="rounded-3xl bg-navy p-5 text-white shadow-lg sm:p-7"><div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Leadership That Works</div><h1 className="mt-2 text-2xl font-semibold sm:text-3xl">{feed.batch.name}</h1><p className="mt-1 text-sm text-slate-300">{feed.batch.code} · {feed.membership?.role}</p><div className="mt-5"><div className="flex justify-between text-xs text-slate-300"><span>Progress aktivitas terbuka</span><span>{progress.done}/{progress.total}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-amber-300" style={{width:`${progress.total?Math.round(progress.done/progress.total*100):0}%`}}/></div></div></header><div className="mt-5 space-y-4">{feed.activities.map(a=>{const code=typeof a.config?.contentCode==='string'?a.config.contentCode:'';const item=feed.content[code];return <section key={a.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{a.session?.code} · {a.session?.title}</div><h2 className="mt-1 text-lg font-semibold">{a.title}</h2></div><StatusPill status={a.status} done={Boolean(a.submission)||Boolean(a.testAttempt?.submittedAt)}/></div>{(a.status==='OPEN'||a.submission)&&<ActivityBody batchId={batchId} activity={a} content={item} onSaved={load}/>}</section>})}</div></div></main>
}
