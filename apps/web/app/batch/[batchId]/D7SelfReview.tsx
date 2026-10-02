'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Feed={
  config:{questions:string[]};
  plan:{id:string;reviewD7:string;status:string};
  existing:null|{answers:{answers?:string[]};progressPct:number;statusLabel:string;submittedAt:string|null};
};

export default function D7SelfReview({activityId}:{activityId:string}){
  const[feed,setFeed]=useState<Feed|null>(null);
  const[answers,setAnswers]=useState<string[]>(Array(5).fill(''));
  const[progress,setProgress]=useState(70);
  const[initialized,setInitialized]=useState(false);
  const[msg,setMsg]=useState('');
  const[busy,setBusy]=useState(false);

  async function load(){
    const r=await fetch('/api/activities/'+activityId+'/d7-review',{cache:'no-store'});
    const d=await r.json();
    if(r.ok){
      setFeed(d);
      if(!initialized){
        if(Array.isArray(d.existing?.answers?.answers)&&d.existing.answers.answers.length===5)setAnswers(d.existing.answers.answers);
        if(typeof d.existing?.progressPct==='number')setProgress(d.existing.progressPct);
        setInitialized(true);
      }
    }else setMsg(d.error||'Gagal memuat D+7 self review');
  }

  useEffect(()=>{void load()},[activityId,initialized]);
  useActivityRealtime(activityId,load,5000);

  async function submit(){
    setBusy(true);setMsg('');
    const r=await fetch('/api/activities/'+activityId+'/d7-review',{
      method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({answers,progressPct:progress}),
    });
    const d=await r.json();setBusy(false);
    if(!r.ok){setMsg(d.error||'Gagal menyimpan D+7 self review');return;}
    setMsg('D+7 self review tersimpan · '+d.statusLabel);
    await load();
  }

  if(!feed)return <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg||'Memuat D+7 self review…'}</div>;
  return <section className="rounded-2xl border border-slate-200 bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-xs font-bold uppercase tracking-[.16em] text-teal">D+7 Self Review</div><div className="mt-1 font-semibold text-navy">Checkpoint perilaku pertama</div></div>
      <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{new Date(feed.plan.reviewD7).toLocaleDateString('id-ID')}</div>
    </div>
    <div className="mt-4 space-y-3">{feed.config.questions.map((q,i)=><label key={i} className="block text-sm font-semibold text-navy">{q}<textarea value={answers[i]} onChange={e=>setAnswers(answers.map((x,j)=>j===i?e.target.value:x))} className="mt-1 min-h-20 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"/></label>)}</div>
    <label className="mt-4 block text-sm font-semibold text-navy">Progress terhadap target: {progress}%<input type="range" min="0" max="100" step="5" value={progress} onChange={e=>setProgress(Number(e.target.value))} className="mt-2 w-full accent-teal"/></label>
    <button disabled={busy||answers.some(x=>!x.trim())} onClick={submit} className="mt-4 w-full rounded-xl bg-teal px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Menyimpan…':'Simpan D+7 Self Review'}</button>
    {feed.existing&&<div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Status terakhir: <b>{feed.existing.statusLabel}</b> · {feed.existing.progressPct}%</div>}
    {msg&&<div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg}</div>}
  </section>;
}
