'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useBatchRealtime } from '@/hooks/useBatchRealtime';

type Row={
  id:string;action:string;resourceType:string;resourceId:string|null;
  actor:null|{id:string;name:string;email:string};
  metadata:any;ipHash:string|null;userAgent:string|null;createdAt:string;
};
type Feed={
  batch:{id:string;code:string;name:string};
  pagination:{page:number;pageSize:number;total:number;pages:number};
  filters:{actions:string[];resourceTypes:string[]};
  rows:Row[];
};

export default function AuditTrailClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');
 const[page,setPage]=useState(1);const[action,setAction]=useState('');const[resourceType,setResourceType]=useState('');const[actor,setActor]=useState('');
 async function load(nextPage=page){
   const q=new URLSearchParams({page:String(nextPage),pageSize:'50'});
   if(action)q.set('action',action);if(resourceType)q.set('resourceType',resourceType);if(actor.trim())q.set('actor',actor.trim());
   const r=await fetch('/api/batches/'+batchId+'/audit?'+q.toString(),{cache:'no-store'});const d=await r.json();
   if(r.ok){setFeed(d);setPage(nextPage);setError('')}else setError(d.error||'Gagal memuat audit trail');
 }
 useEffect(()=>{void load(1)},[batchId]);
 useBatchRealtime(batchId,()=>load(page),5000);
 function submit(e:FormEvent){e.preventDefault();void load(1)}
 if(!feed)return <div className="p-6 text-sm text-slate-600">{error||'Memuat audit trail…'}</div>;
 return <div className="space-y-5">
   <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[180px_220px_1fr_auto]">
     <select value={action} onChange={e=>setAction(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Semua action</option>{feed.filters.actions.map(x=><option key={x}>{x}</option>)}</select>
     <select value={resourceType} onChange={e=>setResourceType(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Semua resource</option>{feed.filters.resourceTypes.map(x=><option key={x}>{x}</option>)}</select>
     <input value={actor} onChange={e=>setActor(e.target.value)} placeholder="Cari nama/email actor" className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"/>
     <button className="rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white">Filter</button>
   </form>
   <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
     <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4"><div><h2 className="text-lg font-semibold text-navy">Audit Trail</h2><p className="mt-1 text-sm text-slate-500">{feed.pagination.total} event · newest first.</p></div><div className="text-xs text-slate-500">Page {feed.pagination.page}/{feed.pagination.pages}</div></div>
     <div className="divide-y divide-slate-100">{feed.rows.length===0?<div className="p-6 text-sm text-slate-500">Tidak ada event untuk filter ini.</div>:feed.rows.map(row=><article key={row.id} className="p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700">{row.action}</span><span className="text-sm font-semibold text-navy">{row.resourceType}</span>{row.resourceId&&<span className="font-mono text-xs text-slate-400">{row.resourceId.slice(0,12)}</span>}</div><div className="mt-2 text-sm text-slate-600">{row.actor?row.actor.name+' · '+row.actor.email:'System / automated job'}</div></div><time className="text-xs text-slate-500">{new Date(row.createdAt).toLocaleString('id-ID')}</time></div>{row.metadata&&<details className="mt-3"><summary className="cursor-pointer text-xs font-semibold text-teal">Metadata</summary><pre className="mt-2 overflow-x-auto rounded-xl bg-slate-950 p-3 text-[11px] leading-5 text-slate-200">{JSON.stringify(row.metadata,null,2)}</pre></details>}</article>)}</div>
     <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4"><button disabled={page<=1} onClick={()=>void load(page-1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-30">← Previous</button><button disabled={page>=feed.pagination.pages} onClick={()=>void load(page+1)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-30">Next →</button></div>
   </section>
   {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
 </div>
}
