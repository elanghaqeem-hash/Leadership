'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useBatchRealtime } from '@/hooks/useBatchRealtime';

type Spec={code:string;name:string;min:number;max:number};
type Activity={
 id:string;type:string;title:string;status:string;
 session:{code:string;title:string}|null;
 rubric:null|{id:string;code:string;name:string;spec:Spec[]};
};
type Team={id:string;name:string;number:number};
type Score={activityId:string;teamId:string;dimensionCode:string;rawValue:number;note:string|null};
type Feed={batch:{id:string;code:string;name:string};teams:Team[];activities:Activity[];scores:Score[]};

function RubricCard({batchId,activity,team,scores,onSaved}:{batchId:string;activity:Activity;team:Team;scores:Score[];onSaved:()=>void}){
 const spec=activity.rubric?.spec||[];
 const existing=Object.fromEntries(scores.filter(s=>s.activityId===activity.id&&s.teamId===team.id).map(s=>[s.dimensionCode,s.rawValue]));
 const[values,setValues]=useState<Record<string,number>>(()=>Object.fromEntries(spec.map(x=>[x.code,existing[x.code]??x.min])));
 const[notes,setNotes]=useState<Record<string,string>>(()=>Object.fromEntries(scores.filter(s=>s.activityId===activity.id&&s.teamId===team.id).map(s=>[s.dimensionCode,s.note||''])));
 const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);
 useEffect(()=>{setValues(Object.fromEntries(spec.map(x=>[x.code,existing[x.code]??x.min])));setNotes(Object.fromEntries(scores.filter(s=>s.activityId===activity.id&&s.teamId===team.id).map(s=>[s.dimensionCode,s.note||''])))},[activity.id,team.id,scores.length]);
 const total=spec.reduce((s,x)=>s+(values[x.code]??0),0);const max=spec.reduce((s,x)=>s+x.max,0);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setMsg('');const r=await fetch('/api/observer/batches/'+batchId+'/rubrics',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({activityId:activity.id,teamId:team.id,values,notes})});const d=await r.json();setBusy(false);if(!r.ok){setMsg(d.error||'Gagal menyimpan rubric');return;}setMsg('Tersimpan · '+d.total+'/'+d.max+' ('+Math.round(d.percent)+'%)');onSaved()}
 if(!activity.rubric)return <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Rubric belum tersedia.</div>;
 const editable=['OPEN','LOCKED','REVEALED'].includes(activity.status);
 return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
   <div className="flex flex-wrap items-start justify-between gap-3">
     <div><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{activity.session?.code} · {activity.type}</div><h2 className="mt-1 text-lg font-semibold text-navy">{activity.title}</h2><p className="mt-1 text-xs text-slate-500">{activity.rubric.name}</p></div>
     <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-navy">{total}/{max}</div>
   </div>
   <div className="mt-4 space-y-3">{spec.map(item=><div key={item.code} className="rounded-xl bg-slate-50 p-3">
      <div className="flex items-center justify-between gap-3"><label className="text-sm font-semibold text-slate-700">{item.name}</label><span className="text-xs text-slate-500">max {item.max}</span></div>
      {item.max===1?<label className="mt-2 flex items-center gap-3 text-sm"><input type="checkbox" checked={(values[item.code]??0)===1} onChange={e=>setValues(v=>({...v,[item.code]:e.target.checked?1:0}))} disabled={!editable}/><span>Disampaikan / terpenuhi</span></label>:<input type="range" min={item.min} max={item.max} step="1" value={values[item.code]??item.min} onChange={e=>setValues(v=>({...v,[item.code]:Number(e.target.value)}))} disabled={!editable} className="mt-3 w-full accent-teal"/>}
      {item.max>1&&<div className="mt-1 text-right text-sm font-bold text-teal">{values[item.code]??item.min}</div>}
      <input value={notes[item.code]||''} onChange={e=>setNotes(v=>({...v,[item.code]:e.target.value}))} disabled={!editable} placeholder="Catatan observer (opsional)" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"/>
   </div>)}</div>
   {msg&&<div className="mt-3 text-sm text-slate-600">{msg}</div>}
   <button disabled={!editable||busy} className="mt-4 w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-40">{busy?'Menyimpan…':'Simpan Penilaian '+team.name}</button>
   {!editable&&<p className="mt-2 text-xs text-slate-500">Trainer harus membuka aktivitas sebelum observer dapat menilai.</p>}
 </form>
}

export default function ObserverRubricClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[teamId,setTeamId]=useState('');const[error,setError]=useState('');const[loading,setLoading]=useState(true);
 async function load(){const r=await fetch('/api/observer/batches/'+batchId+'/rubrics',{cache:'no-store'});const d=await r.json();if(!r.ok){setError(d.error||'Gagal memuat rubric');setLoading(false);return;}setFeed(d);setTeamId(v=>v||d.teams?.[0]?.id||'');setLoading(false)}
 useEffect(()=>{void load()},[batchId]);
 useBatchRealtime(batchId,load,5000);
 const team=useMemo(()=>feed?.teams.find(t=>t.id===teamId)||null,[feed,teamId]);
 if(loading)return <main className="min-h-screen bg-slate-50 p-4"><div className="mx-auto max-w-3xl animate-pulse space-y-4"><div className="h-28 rounded-3xl bg-slate-200"/><div className="h-56 rounded-2xl bg-slate-200"/></div></main>;
 if(!feed)return <main className="p-6 text-red-700">{error||'Data tidak tersedia'}</main>;
 return <main className="min-h-screen bg-slate-50 px-4 py-5"><div className="mx-auto max-w-3xl">
   <header className="rounded-3xl bg-navy p-5 text-white shadow-lg"><div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">Observer Console</div><h1 className="mt-2 text-2xl font-semibold">{feed.batch.name}</h1><p className="mt-1 text-sm text-slate-300">Delegation Relay · Boardroom · War Room</p></header>
   {feed.teams.length===0?<div className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">Belum ada tim yang ditugaskan kepada observer ini.</div>:<>
     <label className="mt-5 block text-sm font-semibold text-slate-700">Tim yang dinilai<select value={teamId} onChange={e=>setTeamId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3">{feed.teams.map(t=><option key={t.id} value={t.id}>Tim {t.number} — {t.name}</option>)}</select></label>
     {error&&<div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
     <div className="mt-5 space-y-4">{team&&feed.activities.map(a=><RubricCard key={a.id+'-'+team.id} batchId={batchId} activity={a} team={team} scores={feed.scores} onSaved={load}/>)}</div>
   </>}
 </div></main>
}
