'use client';

import { useEffect, useMemo, useState } from 'react';
import { useBatchRealtime } from '@/hooks/useBatchRealtime';

type Metric={code:string;name:string;direction:string;baseline:number|null;day30:number|null;percentChange:number|null;improved:boolean|null};
type Follow={kind:'D7'|'D14'|'D30';answers:{answers?:string[];sbiFeedback?:string};progressPct:number;statusLabel:string;submittedAt:string|null};
type Row={
 participant:{id:string;name:string;email:string};
 plan:null|{id:string;startDate:string;reviewD7:string;reviewD14:string;reviewD30:string;status:string;targets:Array<{sequence:number;behavior:string;elements:any}>;followUps:Follow[]};
 metrics:Metric[];
};
type Feed={batch:{id:string;code:string;name:string};config:{questions:string[];thresholds:any};subordinates:Row[]};

const kinds=['D14','D30'] as const;

function FollowUpEditor({batchId,row,questions,onSaved}:{batchId:string;row:Row;questions:string[];onSaved:()=>void}){
 const[kind,setKind]=useState<'D14'|'D30'>('D14');
 const[answers,setAnswers]=useState<string[]>(Array(5).fill(''));
 const[progress,setProgress]=useState(70);
 const[sbiFeedback,setSbiFeedback]=useState('');
 const[baselineMetrics,setBaselineMetrics]=useState<Record<string,string>>({});
 const[day30Metrics,setDay30Metrics]=useState<Record<string,string>>({});
 const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);

 useEffect(()=>{
   const existing=row.plan?.followUps.find(f=>f.kind===kind);
   setAnswers(existing?.answers?.answers?.length===5?existing.answers.answers:Array(5).fill(''));
   setProgress(existing?.progressPct??70);
   setSbiFeedback(existing?.answers?.sbiFeedback||'');
   const baseline:Record<string,string>={},day30:Record<string,string>={};
   for(const metric of row.metrics){
     if(metric.baseline!==null&&metric.baseline!==undefined)baseline[metric.code]=String(metric.baseline);
     if(metric.day30!==null&&metric.day30!==undefined)day30[metric.code]=String(metric.day30);
   }
   setBaselineMetrics(baseline);setDay30Metrics(day30);
 },[kind,row.plan?.followUps,row.metrics]);

 async function submit(){
   setBusy(true);setMsg('');
   const baseline=Object.fromEntries(row.metrics.map(m=>[m.code,baselineMetrics[m.code]?.trim()?Number(baselineMetrics[m.code]):null]));
   const day30=Object.fromEntries(row.metrics.map(m=>[m.code,day30Metrics[m.code]?.trim()?Number(day30Metrics[m.code]):null]));
   const r=await fetch('/api/manager/batches/'+batchId+'/plans',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({participantUserId:row.participant.id,kind,answers,progressPct:progress,sbiFeedback,baselineMetrics:baseline,day30Metrics:kind==='D30'?day30:{}})});
   const d=await r.json();setBusy(false);if(!r.ok){setMsg(d.error||'Gagal menyimpan follow-up');return;}setMsg(kind+' tersimpan · '+d.statusLabel);onSaved();
 }
 if(!row.plan)return <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Participant belum mengaktifkan 30-Day Plan.</div>;
 return <div className="mt-4 space-y-4">
   <div className="grid grid-cols-2 gap-2">{kinds.map(k=><button key={k} type="button" onClick={()=>setKind(k)} className={`rounded-xl px-3 py-2 text-sm font-bold ring-1 ${kind===k?'bg-navy text-white ring-navy':'bg-white text-slate-600 ring-slate-200'}`}>{k}</button>)}</div>
   <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Target review: {kind==='D14'?new Date(row.plan.reviewD14).toLocaleDateString('id-ID'):new Date(row.plan.reviewD30).toLocaleDateString('id-ID')}</div>
   <div className="space-y-3">{questions.map((q,i)=><label key={i} className="block text-sm font-semibold text-navy">{q}<textarea value={answers[i]} onChange={e=>setAnswers(answers.map((x,j)=>j===i?e.target.value:x))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" required/></label>)}</div>
   <label className="block text-sm font-semibold text-navy">Progress terhadap target: {progress}%<input type="range" min="0" max="100" step="5" value={progress} onChange={e=>setProgress(Number(e.target.value))} className="mt-2 w-full accent-teal"/></label>
   <label className="block text-sm font-semibold text-navy">Feedback SBI<textarea value={sbiFeedback} onChange={e=>setSbiFeedback(e.target.value)} placeholder="Situation — Behavior — Impact. Contoh: Pada rapat kredit tadi pagi, Anda merangkum fakta sebelum memberi rekomendasi; diskusi menjadi lebih cepat dan jelas." className="mt-2 min-h-24 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"/></label>
   <div className="rounded-2xl border border-slate-200 p-4"><div className="font-semibold text-navy">Impact Metrics — Baseline Joint Review{kind==='D30'?' & Day 30':''}</div><p className="mt-1 text-xs leading-5 text-slate-500">Manager dapat mengonfirmasi atau memperbarui baseline bersama participant. Pada D30, isi nilai aktual Day 30; status membaik dihitung otomatis mengikuti arah metrik.</p><div className="mt-3 grid gap-3 sm:grid-cols-2">{row.metrics.map(m=><div key={m.code} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="font-medium text-slate-800">{m.name}</div><div className="mt-1 text-xs text-slate-500">{m.direction==='UP_IS_BETTER'?'Naik = lebih baik':'Turun = lebih baik'}</div><div className={`mt-2 grid gap-2 ${kind==='D30'?'grid-cols-2':'grid-cols-1'}`}><label className="text-xs font-semibold text-slate-600">Baseline<input type="number" step="any" value={baselineMetrics[m.code]||''} onChange={e=>setBaselineMetrics(v=>({...v,[m.code]:e.target.value}))} placeholder="Baseline" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>{kind==='D30'&&<label className="text-xs font-semibold text-slate-600">Day 30<input type="number" step="any" value={day30Metrics[m.code]||''} onChange={e=>setDay30Metrics(v=>({...v,[m.code]:e.target.value}))} placeholder="D+30" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"/></label>}</div>{m.percentChange!==null&&m.percentChange!==undefined&&<div className={`mt-2 text-xs font-semibold ${m.improved?'text-emerald-700':'text-amber-700'}`}>{(m.percentChange*100).toFixed(1)}% · {m.improved?'Membaik':'Belum membaik'}</div>}</div>)}</div></div>
   <button disabled={busy||answers.some(x=>!x.trim())} onClick={submit} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Menyimpan…':'Simpan '+kind+' Follow-up'}</button>
   {msg&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg}</div>}
 </div>
}

export default function ManagerFollowUpClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');
 async function load(){const r=await fetch('/api/manager/batches/'+batchId+'/plans',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat manager follow-up')}
 useEffect(()=>{void load()},[batchId]);useBatchRealtime(batchId,load,5000);
 const ready=useMemo(()=>feed?.subordinates.filter(x=>x.plan).length??0,[feed]);
 if(!feed)return <div className="p-6 text-sm text-slate-600">{error||'Memuat manager follow-up…'}</div>;
 return <div className="space-y-6">
   <div className="rounded-2xl bg-navy p-5 text-white"><div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Manager Follow-up</div><h2 className="mt-2 text-2xl font-semibold">{feed.batch.name}</h2><div className="mt-2 text-sm text-slate-300">{ready}/{feed.subordinates.length} subordinate sudah memiliki 30-Day Plan.</div></div>
   {feed.subordinates.length===0?<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-600">Belum ada participant yang dipetakan ke Anda sebagai Line Manager.</div>:feed.subordinates.map(row=><section key={row.participant.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="text-lg font-semibold text-navy">{row.participant.name}</div><div className="text-sm text-slate-500">{row.participant.email}</div></div>{row.plan&&<span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">{row.plan.status}</span>}</div>{row.plan&&<div className="mt-4 grid gap-2 sm:grid-cols-3">{row.plan.targets.map(t=><div key={t.sequence} className="rounded-xl bg-slate-50 p-3 text-sm"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Target {t.sequence}</div><div className="mt-1 font-semibold text-slate-800">{t.behavior}</div></div>)}</div>}<FollowUpEditor batchId={batchId} row={row} questions={feed.config.questions} onSaved={load}/></section>)}
   {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
 </div>
}
