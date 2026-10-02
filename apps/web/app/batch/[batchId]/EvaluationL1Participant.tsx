'use client';

import { useEffect, useState } from 'react';
import { useActivityRealtime } from '@/hooks/useActivityRealtime';

type Feed={
  activity:{id:string;title:string;status:string};
  statements:string[];
  existing:null|{answers:{ratings?:number[];comment?:string};averageScore:number|null;submittedAt:string|null};
};

export default function EvaluationL1Participant({activityId}:{activityId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[ratings,setRatings]=useState<number[]>(Array(8).fill(4));const[comment,setComment]=useState('');const[initialized,setInitialized]=useState(false);const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
 async function load(){const r=await fetch('/api/activities/'+activityId+'/evaluation-l1',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);if(!initialized){if(Array.isArray(d.existing?.answers?.ratings)&&d.existing.answers.ratings.length===8)setRatings(d.existing.answers.ratings);setComment(d.existing?.answers?.comment||'');setInitialized(true)}}else setMsg(d.error||'Gagal memuat evaluasi')}
 useEffect(()=>{void load()},[activityId,initialized]);
 useActivityRealtime(activityId,load,5000);
 async function submit(){setBusy(true);setMsg('');const r=await fetch('/api/activities/'+activityId+'/evaluation-l1',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({ratings,comment})});const d=await r.json();setBusy(false);if(!r.ok){setMsg(d.error||'Gagal menyimpan evaluasi');return;}setMsg('Evaluasi tersimpan · rata-rata '+Number(d.averageScore).toFixed(2)+'/5');await load()}
 if(!feed)return <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{msg||'Memuat Evaluasi L1…'}</div>;
 return <div className="mt-4 space-y-4">
   <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Nilai setiap pernyataan 1–5: 1 = sangat tidak setuju, 5 = sangat setuju.</div>
   <div className="space-y-3">{feed.statements.map((s,i)=><div key={i} className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-sm font-semibold text-navy">{i+1}. {s}</div><div className="mt-3 grid grid-cols-5 gap-2">{[1,2,3,4,5].map(v=><button type="button" key={v} disabled={feed.activity.status!=='OPEN'||busy} onClick={()=>setRatings(ratings.map((x,j)=>j===i?v:x))} className={`rounded-lg py-2 text-sm font-bold ring-1 ${ratings[i]===v?'bg-teal text-white ring-teal':'bg-white text-slate-600 ring-slate-200'}`}>{v}</button>)}</div></div>)}</div>
   <label className="block text-sm font-semibold text-navy">Komentar / saran<textarea disabled={feed.activity.status!=='OPEN'} value={comment} onChange={e=>setComment(e.target.value)} placeholder="Opsional" className="mt-2 min-h-28 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"/></label>
   <button disabled={busy||feed.activity.status!=='OPEN'} onClick={submit} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Menyimpan…':'Simpan Evaluasi L1'}</button>
   {feed.existing?.averageScore!==null&&feed.existing?.averageScore!==undefined&&<div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">Rata-rata tersimpan: <b>{Number(feed.existing.averageScore).toFixed(2)}/5</b></div>}
   {msg&&<div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{msg}</div>}
 </div>
}
