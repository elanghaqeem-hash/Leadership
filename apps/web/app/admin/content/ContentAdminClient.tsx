'use client';

import { FormEvent, useState } from 'react';

type Result={ok:boolean;dryRun:boolean;errors?:string[];summary?:{contentItems:number;rubrics:number;questions:number}};

export default function ContentAdminClient(){
 const[file,setFile]=useState<File|null>(null);const[result,setResult]=useState<Result|null>(null);const[busy,setBusy]=useState('');
 async function send(dryRun:boolean){
  if(!file)return;
  setBusy(dryRun?'validate':'import');setResult(null);
  const form=new FormData();form.append('file',file);
  const r=await fetch('/api/admin/content/import-xlsx?dryRun='+(dryRun?'1':'0'),{method:'POST',body:form});
  const d=await r.json();setBusy('');setResult(d);
 }
 function submit(e:FormEvent){e.preventDefault();void send(true)}
 return <div className="space-y-5">
   <section className="rounded-2xl border border-slate-200 bg-white p-5">
     <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
       <div><h2 className="text-xl font-semibold text-navy">Master Content XLSX</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Kelola Content Items, Rubrics, dan Test Questions sebagai data. Export workbook terlebih dahulu, edit dengan struktur kolom yang sama, validasi, lalu import.</p></div>
       <a href="/api/admin/content/export-xlsx" className="rounded-xl bg-navy px-4 py-3 text-sm font-semibold text-white">Export Master XLSX ↓</a>
     </div>
   </section>
   <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5">
     <div className="text-sm font-semibold text-navy">Import perubahan</div>
     <p className="mt-1 text-xs leading-5 text-slate-500">Maks. 5 MB. JSON pada PayloadJSON, AnswerKeyJSON, DimensionsJSON, dan OptionsJSON harus valid. Hanya Super Admin yang dapat menjalankan proses ini.</p>
     <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{setFile(e.target.files?.[0]||null);setResult(null)}} className="mt-4 block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm"/>
     <div className="mt-4 grid grid-cols-2 gap-3">
       <button disabled={!file||busy!==''} className="rounded-xl border border-teal px-4 py-3 font-semibold text-teal disabled:opacity-40">{busy==='validate'?'Memvalidasi…':'1. Validasi XLSX'}</button>
       <button type="button" disabled={!file||busy!==''||!result?.ok||!result?.dryRun} onClick={()=>void send(false)} className="rounded-xl bg-teal px-4 py-3 font-semibold text-white disabled:opacity-40">{busy==='import'?'Mengimpor…':'2. Import ke Master'}</button>
     </div>
   </form>
   {result&&<section className={`rounded-2xl p-5 ring-1 ${result.ok?'bg-emerald-50 text-emerald-950 ring-emerald-200':'bg-red-50 text-red-950 ring-red-200'}`}>
      <div className="font-semibold">{result.ok?(result.dryRun?'Validasi berhasil':'Import berhasil'):'Validasi gagal'}</div>
      {result.summary&&<div className="mt-2 grid grid-cols-3 gap-2 text-sm"><div>Content <b>{result.summary.contentItems}</b></div><div>Rubric <b>{result.summary.rubrics}</b></div><div>Question <b>{result.summary.questions}</b></div></div>}
      {result.errors?.length?<ul className="mt-3 list-disc space-y-1 pl-5 text-sm">{result.errors.map((e,i)=><li key={i}>{e}</li>)}</ul>:null}
   </section>}
 </div>
}
