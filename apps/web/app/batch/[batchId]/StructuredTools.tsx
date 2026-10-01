'use client';

import { FormEvent, useState } from 'react';

export const STRUCTURED_TYPES = new Set([
  'MINUTE_AUDIT','DAILY_BIG_3','MEETING_CHECKLIST','DELEGATION_CONTRACT','RACI_BUILDER','GROW_COACHING','SBI_FEEDBACK',
  'FACT_ASSUMPTION_OPINION_UNKNOWN','FIVE_WHYS','FISHBONE','ISSUE_TREE','BIAS_CHECKLIST','DECISION_MATRIX',
  'PRE_MORTEM','DECISION_LOG','ACTION_TRACKER','REFLECTION','AAR_STOP_START_CONTINUE',
]);

type Props={activity:any;save:(payload:unknown)=>Promise<any>;onSaved:()=>void};
const cls="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5";
const area=cls+" min-h-24";

function Frame({children,submit}:{children:React.ReactNode;submit:()=>Promise<void>}){
 const[msg,setMsg]=useState('');const[loading,setLoading]=useState(false);
 async function onSubmit(e:FormEvent){e.preventDefault();setLoading(true);setMsg('');try{await submit();setMsg('Tersimpan.');}catch(e){setMsg(e instanceof Error?e.message:'Gagal menyimpan');}finally{setLoading(false)}}
 return <form onSubmit={onSubmit} className="mt-4 space-y-3">{children}{msg&&<p className="text-sm text-slate-600">{msg}</p>}<button disabled={loading} className="w-full rounded-xl bg-navy px-4 py-3 font-semibold text-white disabled:opacity-50">{loading?'Menyimpan…':'Simpan'}</button></form>
}

function MinuteAudit({activity,save,onSaved}:Props){
 type Item={id:string;activity:string;durationMin:number;category:string};
 const categories=['Focus','Meeting','Customer','People/Coaching','Admin/Batch','Buffer','Break','Other'];
 const old=activity.submission?.payload?.items||[];
 const[items,setItems]=useState<Item[]>(old.length?old.map((x:any)=>({...x,id:crypto.randomUUID()})):[{id:crypto.randomUUID(),activity:'',durationMin:30,category:'Focus'}]);
 const total=items.reduce((s,x)=>s+(Number(x.durationMin)||0),0);
 return <Frame submit={async()=>{await save({items:items.map(({id,...x})=>x)});onSaved()}}>
   <div className="rounded-xl bg-slate-50 p-3">
     <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">Total waktu</span><span className={`font-mono text-lg font-bold ${total>480?'text-red-600':'text-navy'}`}>{total}/480 menit</span></div>
     <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full ${total>480?'bg-red-500':'bg-teal'}`} style={{width:`${Math.min(100,total/480*100)}%`}}/></div>
   </div>
   {items.map((x,i)=><div key={x.id} className="rounded-xl border border-slate-200 p-3">
     <div className="flex items-center justify-between"><span className="text-sm font-semibold">Aktivitas {i+1}</span>{items.length>1&&<button type="button" onClick={()=>setItems(items.filter(y=>y.id!==x.id))} className="text-xs font-semibold text-red-600">Hapus</button>}</div>
     <input required value={x.activity} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,activity:e.target.value}:y))} placeholder="Contoh: Meeting cabang" className={"mt-2 "+cls}/>
     <div className="mt-2 grid grid-cols-2 gap-2"><input type="number" min="1" max="480" required value={x.durationMin} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,durationMin:Number(e.target.value)}:y))} className={cls}/><select value={x.category} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,category:e.target.value}:y))} className={cls}>{categories.map(k=><option key={k}>{k}</option>)}</select></div>
   </div>)}
   <button type="button" onClick={()=>setItems([...items,{id:crypto.randomUUID(),activity:'',durationMin:30,category:'Focus'}])} className="w-full rounded-xl border border-teal py-2.5 font-semibold text-teal">+ Aktivitas</button>
 </Frame>
}

function Big3({activity,save,onSaved}:Props){
 const old=activity.submission?.payload?.items||['','',''];const[items,setItems]=useState<string[]>(old);
 return <Frame submit={async()=>{await save({items});onSaved()}}>{items.map((v,i)=><label key={i} className="block text-sm font-medium">Big {i+1}<input value={v} onChange={e=>setItems(items.map((x,j)=>j===i?e.target.value:x))} required className={"mt-1 "+cls} placeholder="Outcome penting hari ini"/></label>)}</Frame>
}

function Meeting({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const[purpose,setPurpose]=useState(old.purpose||'');
 const keys=[['decisionRequired','Ada keputusan/outcome yang jelas?'],['rightParticipants','Peserta yang tepat?'],['preReadReady','Pre-read siap?'],['timeboxed','Ada timebox?'],['canBeAsync','Bisa diselesaikan asynchronous?']] as const;
 const[state,setState]=useState<Record<string,boolean>>(()=>Object.fromEntries(keys.map(([k])=>[k,Boolean(old[k])])));
 return <Frame submit={async()=>{await save({purpose,...state});onSaved()}}><label className="block text-sm font-medium">Tujuan meeting<textarea value={purpose} onChange={e=>setPurpose(e.target.value)} required className={"mt-1 "+area}/></label>{keys.map(([k,label])=><label key={k} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 text-sm"><span>{label}</span><input type="checkbox" checked={state[k]} onChange={e=>setState({...state,[k]:e.target.checked})}/></label>)}</Frame>
}

function Delegation({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const fields=[['outcome','Outcome'],['why','Why'],['owner','Owner'],['authorityBoundary','Authority / Boundary'],['resources','Resources'],['checkpoint','Checkpoint'],['evidence','Evidence of Done']] as const;
 const[state,setState]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(([k])=>[k,old[k]||''])));
 const[level,setLevel]=useState(old.level||'L3');
 return <Frame submit={async()=>{await save({...state,level});onSaved()}}>{fields.map(([k,label])=><label key={k} className="block text-sm font-medium">{label}{['why','authorityBoundary','resources','evidence'].includes(k)?<textarea value={state[k]} onChange={e=>setState({...state,[k]:e.target.value})} required className={"mt-1 "+area}/>:<input value={state[k]} onChange={e=>setState({...state,[k]:e.target.value})} required className={"mt-1 "+cls}/>}</label>)}<label className="block text-sm font-medium">Delegation Level<select value={level} onChange={e=>setLevel(e.target.value)} className={"mt-1 "+cls}>{['L1','L2','L3','L4','L5'].map(x=><option key={x}>{x}</option>)}</select></label></Frame>
}

function Raci({activity,save,onSaved}:Props){
 type A={stakeholder:string;role:'R'|'A'|'C'|'I'};type Row={id:string;task:string;assignments:A[]};
 const old=activity.submission?.payload?.rows||[];const init:Row[]=old.length?old.map((r:any)=>({...r,id:crypto.randomUUID()})):[{id:crypto.randomUUID(),task:'',assignments:[{stakeholder:'',role:'A'}]}];
 const[rows,setRows]=useState<Row[]>(init);
 const addAss=(id:string)=>setRows(rows.map(r=>r.id===id?{...r,assignments:[...r.assignments,{stakeholder:'',role:'R'}]}:r));
 return <Frame submit={async()=>{await save({rows:rows.map(({id,...r})=>r)});onSaved()}}>{rows.map((r,ri)=><div key={r.id} className="rounded-xl border border-slate-200 p-3"><div className="text-sm font-semibold">Task {ri+1}</div><input value={r.task} onChange={e=>setRows(rows.map(x=>x.id===r.id?{...x,task:e.target.value}:x))} required placeholder="Aktivitas / keputusan" className={"mt-2 "+cls}/><div className="mt-2 space-y-2">{r.assignments.map((a,ai)=><div key={ai} className="grid grid-cols-[1fr_90px] gap-2"><input value={a.stakeholder} required placeholder="Stakeholder" onChange={e=>setRows(rows.map(x=>x.id===r.id?{...x,assignments:x.assignments.map((z,j)=>j===ai?{...z,stakeholder:e.target.value}:z)}:x))} className={cls}/><select value={a.role} onChange={e=>setRows(rows.map(x=>x.id===r.id?{...x,assignments:x.assignments.map((z,j)=>j===ai?{...z,role:e.target.value as A['role']}:z)}:x))} className={cls}>{['R','A','C','I'].map(x=><option key={x}>{x}</option>)}</select></div>)}</div><button type="button" onClick={()=>addAss(r.id)} className="mt-2 text-sm font-semibold text-teal">+ Stakeholder</button></div>)}<button type="button" onClick={()=>setRows([...rows,{id:crypto.randomUUID(),task:'',assignments:[{stakeholder:'',role:'A'}]}])} className="w-full rounded-xl border border-teal py-2.5 font-semibold text-teal">+ Task RACI</button></Frame>
}

function Grow({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const keys=[['goal','Goal'],['reality','Reality'],['options','Options'],['will','Will / Way Forward']] as const;const[state,setState]=useState<Record<string,string>>(()=>Object.fromEntries(keys.map(([k])=>[k,old[k]||''])));
 return <Frame submit={async()=>{await save(state);onSaved()}}>{keys.map(([k,l])=><label key={k} className="block text-sm font-medium">{l}<textarea required value={state[k]} onChange={e=>setState({...state,[k]:e.target.value})} className={"mt-1 "+area}/></label>)}</Frame>
}

function Sbi({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const keys=[['situation','Situation'],['behavior','Behavior'],['impact','Impact'],['nextStep','Next Step']] as const;const[state,setState]=useState<Record<string,string>>(()=>Object.fromEntries(keys.map(([k])=>[k,old[k]||''])));
 const generated=activity.submission?.scoreDetail?.generatedFeedback;
 return <Frame submit={async()=>{await save(state);onSaved()}}>{keys.map(([k,l])=><label key={k} className="block text-sm font-medium">{l}<textarea required value={state[k]} onChange={e=>setState({...state,[k]:e.target.value})} className={"mt-1 "+area}/></label>)}{generated&&<div className="rounded-xl bg-teal/10 p-3 text-sm"><b>Draft SBI:</b> {generated}</div>}</Frame>
}

function FactSeparator({activity,save,onSaved}:Props){
 type I={id:string;statement:string;type:string;evidence:string};const old=activity.submission?.payload?.items||[];const[items,setItems]=useState<I[]>(old.length?old.map((x:any)=>({...x,id:crypto.randomUUID()})):[{id:crypto.randomUUID(),statement:'',type:'FACT',evidence:''}]);
 return <Frame submit={async()=>{await save({items:items.map(({id,...x})=>x)});onSaved()}}>{items.map((x,i)=><div key={x.id} className="rounded-xl border border-slate-200 p-3"><textarea required value={x.statement} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,statement:e.target.value}:y))} placeholder={`Pernyataan ${i+1}`} className={area}/><div className="mt-2 grid grid-cols-2 gap-2"><select value={x.type} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,type:e.target.value}:y))} className={cls}>{['FACT','ASSUMPTION','OPINION','UNKNOWN'].map(t=><option key={t}>{t}</option>)}</select><input value={x.evidence} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,evidence:e.target.value}:y))} placeholder="Evidence / source" className={cls}/></div></div>)}<button type="button" onClick={()=>setItems([...items,{id:crypto.randomUUID(),statement:'',type:'FACT',evidence:''}])} className="w-full rounded-xl border border-teal py-2.5 font-semibold text-teal">+ Pernyataan</button></Frame>
}

function FiveWhys({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const[problem,setProblem]=useState(old.problem||'');const[whys,setWhys]=useState<string[]>(old.whys||['','','','','']);
 return <Frame submit={async()=>{await save({problem,whys});onSaved()}}><label className="block text-sm font-medium">Problem<textarea required value={problem} onChange={e=>setProblem(e.target.value)} className={"mt-1 "+area}/></label>{whys.map((w,i)=><label key={i} className="block text-sm font-medium">Why {i+1}<textarea required value={w} onChange={e=>setWhys(whys.map((x,j)=>j===i?e.target.value:x))} className={"mt-1 "+area}/></label>)}</Frame>
}

function Fishbone({activity,save,onSaved}:Props){
 const cats=['People','Process','Policy','System','Data','Environment'];const old=activity.submission?.payload||{};const[problem,setProblem]=useState(old.problem||'');const[state,setState]=useState<Record<string,string>>(()=>Object.fromEntries(cats.map(k=>[k,(old.categories?.[k]||[]).join('\n')])));
 return <Frame submit={async()=>{await save({problem,categories:Object.fromEntries(cats.map(k=>[k,state[k].split('\n').map(x=>x.trim()).filter(Boolean)]))});onSaved()}}><label className="block text-sm font-medium">Problem<textarea required value={problem} onChange={e=>setProblem(e.target.value)} className={"mt-1 "+area}/></label><div className="grid gap-3 sm:grid-cols-2">{cats.map(k=><label key={k} className="block text-sm font-medium">{k}<textarea value={state[k]} onChange={e=>setState({...state,[k]:e.target.value})} placeholder="1 penyebab per baris" className={"mt-1 "+area}/></label>)}</div></Frame>
}

function IssueTree({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const[problem,setProblem]=useState(old.problem||'');const[branches,setBranches]=useState<any[]>(old.branches?.length?old.branches.map((x:any)=>({...x,id:crypto.randomUUID(),subText:(x.subIssues||[]).join('\n')})):[{id:crypto.randomUUID(),label:'',subText:''},{id:crypto.randomUUID(),label:'',subText:''}]);
 return <Frame submit={async()=>{await save({problem,branches:branches.map(({id,subText,...x})=>({...x,subIssues:subText.split('\n').map((s:string)=>s.trim()).filter(Boolean)}))});onSaved()}}><label className="block text-sm font-medium">Core problem<textarea required value={problem} onChange={e=>setProblem(e.target.value)} className={"mt-1 "+area}/></label>{branches.map((b:any)=><div key={b.id} className="rounded-xl border border-slate-200 p-3"><input required value={b.label} onChange={e=>setBranches(branches.map(x=>x.id===b.id?{...x,label:e.target.value}:x))} placeholder="MECE branch" className={cls}/><textarea value={b.subText} onChange={e=>setBranches(branches.map(x=>x.id===b.id?{...x,subText:e.target.value}:x))} placeholder="Sub-issue, 1 per baris" className={"mt-2 "+area}/></div>)}<button type="button" onClick={()=>setBranches([...branches,{id:crypto.randomUUID(),label:'',subText:''}])} className="w-full rounded-xl border border-teal py-2.5 font-semibold text-teal">+ Branch</button></Frame>
}

function Bias({activity,save,onSaved}:Props){
 const defaults=['Confirmation Bias','Anchoring','Availability Bias','Overconfidence','Status Quo Bias','Sunk Cost','Groupthink'];const old=activity.submission?.payload?.checks||[];const[checks,setChecks]=useState<any[]>(old.length?old:defaults.map(bias=>({bias,flagged:false,note:''})));
 return <Frame submit={async()=>{await save({checks});onSaved()}}>{checks.map((x,i)=><div key={x.bias} className="rounded-xl bg-slate-50 p-3"><label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={x.flagged} onChange={e=>setChecks(checks.map((y,j)=>j===i?{...y,flagged:e.target.checked}:y))}/>{x.bias}</label><input value={x.note} onChange={e=>setChecks(checks.map((y,j)=>j===i?{...y,note:e.target.value}:y))} placeholder="Evidence / mitigasi" className={"mt-2 "+cls}/></div>)}</Frame>
}

function DecisionMatrix({activity,save,onSaved}:Props){
 const old=activity.submission?.payload;const defaultCriteria=Array.from({length:9},(_,i)=>({name:`Kriteria ${i+1}`,weight:i===8?20:10}));const[criteria,setCriteria]=useState<any[]>(old?.criteria||defaultCriteria);const[options,setOptions]=useState<any[]>(old?.options||[{id:crypto.randomUUID(),name:'Opsi A',scores:Array(9).fill(3)},{id:crypto.randomUUID(),name:'Opsi B',scores:Array(9).fill(3)}]);const[rev,setRev]=useState(old?.reversibility||'REVERSIBLE');
 return <Frame submit={async()=>{await save({criteria,options:options.map(({id,...o})=>o),reversibility:rev});onSaved()}}><div className="space-y-2">{criteria.map((x,i)=><div key={i} className="grid grid-cols-[1fr_90px] gap-2"><input value={x.name} onChange={e=>setCriteria(criteria.map((y,j)=>j===i?{...y,name:e.target.value}:y))} className={cls}/><input type="number" min="1" max="100" value={x.weight} onChange={e=>setCriteria(criteria.map((y,j)=>j===i?{...y,weight:Number(e.target.value)}:y))} className={cls}/></div>)}</div>{options.map((o:any)=><div key={o.id} className="rounded-xl border border-slate-200 p-3"><input value={o.name} onChange={e=>setOptions(options.map((y:any)=>y.id===o.id?{...y,name:e.target.value}:y))} className={cls}/><div className="mt-2 grid grid-cols-3 gap-2">{o.scores.map((s:number,i:number)=><select key={i} value={s} onChange={e=>setOptions(options.map((y:any)=>y.id===o.id?{...y,scores:y.scores.map((v:number,j:number)=>j===i?Number(e.target.value):v)}:y))} className={cls}>{[1,2,3,4,5].map(v=><option key={v}>{v}</option>)}</select>)}</div></div>)}<button type="button" onClick={()=>setOptions([...options,{id:crypto.randomUUID(),name:`Opsi ${options.length+1}`,scores:Array(9).fill(3)}])} className="w-full rounded-xl border border-teal py-2.5 font-semibold text-teal">+ Opsi</button><select value={rev} onChange={e=>setRev(e.target.value)} className={cls}>{['REVERSIBLE','PARTLY_REVERSIBLE','IRREVERSIBLE'].map(x=><option key={x}>{x}</option>)}</select></Frame>
}

function PreMortem({activity,save,onSaved}:Props){
 const old=activity.submission?.payload?.items||[];const[items,setItems]=useState<any[]>(old.length?old.map((x:any)=>({...x,id:crypto.randomUUID()})):[{id:crypto.randomUUID(),failure:'',likelihood:3,impact:3,warning:'',prevention:''}]);
 return <Frame submit={async()=>{await save({items:items.map(({id,...x})=>x)});onSaved()}}>{items.map((x:any)=><div key={x.id} className="rounded-xl border border-slate-200 p-3"><textarea required value={x.failure} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,failure:e.target.value}:y))} placeholder="Potential failure" className={area}/><div className="mt-2 grid grid-cols-2 gap-2">{['likelihood','impact'].map(k=><label key={k} className="text-xs font-medium">{k}<select value={x[k]} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,[k]:Number(e.target.value)}:y))} className={"mt-1 "+cls}>{[1,2,3,4,5].map(v=><option key={v}>{v}</option>)}</select></label>)}</div><input required value={x.warning} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,warning:e.target.value}:y))} placeholder="Early warning" className={"mt-2 "+cls}/><textarea required value={x.prevention} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,prevention:e.target.value}:y))} placeholder="Prevention" className={"mt-2 "+area}/></div>)}<button type="button" onClick={()=>setItems([...items,{id:crypto.randomUUID(),failure:'',likelihood:3,impact:3,warning:'',prevention:''}])} className="w-full rounded-xl border border-teal py-2.5 font-semibold text-teal">+ Failure mode</button></Frame>
}

function DecisionLog({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const fields=[['decision','Decision'],['context','Context'],['optionsConsidered','Options Considered'],['selectedOption','Selected Option'],['rationale','Rationale'],['risks','Risks'],['owner','Owner'],['reviewDate','Review Date']] as const;const[state,setState]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(([k])=>[k,old[k]||''])));const[reversible,setReversible]=useState(Boolean(old.reversible));
 return <Frame submit={async()=>{await save({...state,reversible});onSaved()}}>{fields.map(([k,l])=><label key={k} className="block text-sm font-medium">{l}{k==='reviewDate'?<input type="date" required value={state[k]} onChange={e=>setState({...state,[k]:e.target.value})} className={"mt-1 "+cls}/>:<textarea required value={state[k]} onChange={e=>setState({...state,[k]:e.target.value})} className={"mt-1 "+area}/>}</label>)}<label className="flex gap-3 rounded-xl bg-slate-50 p-3 text-sm"><input type="checkbox" checked={reversible} onChange={e=>setReversible(e.target.checked)}/>Keputusan reversible</label></Frame>
}

function ActionTracker({activity,save,onSaved}:Props){
 const old=activity.submission?.payload?.items||[];const[items,setItems]=useState<any[]>(old.length?old.map((x:any)=>({...x,id:crypto.randomUUID()})):[{id:crypto.randomUUID(),action:'',owner:'',deadline:'',evidence:'',status:'Open'}]);
 return <Frame submit={async()=>{await save({items:items.map(({id,...x})=>x)});onSaved()}}>{items.map((x:any)=><div key={x.id} className="rounded-xl border border-slate-200 p-3"><textarea value={x.action} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,action:e.target.value}:y))} placeholder="Action" className={area}/><div className="mt-2 grid grid-cols-2 gap-2"><input value={x.owner} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,owner:e.target.value}:y))} placeholder="Owner" className={cls}/><input type="date" value={x.deadline} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,deadline:e.target.value}:y))} className={cls}/><input value={x.evidence} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,evidence:e.target.value}:y))} placeholder="Evidence" className={cls}/><select value={x.status} onChange={e=>setItems(items.map(y=>y.id===x.id?{...y,status:e.target.value}:y))} className={cls}>{['Open','On track','Done'].map(v=><option key={v}>{v}</option>)}</select></div></div>)}<button type="button" onClick={()=>setItems([...items,{id:crypto.randomUUID(),action:'',owner:'',deadline:'',evidence:'',status:'Open'}])} className="w-full rounded-xl border border-teal py-2.5 font-semibold text-teal">+ Action</button></Frame>
}

function Reflection({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const[state,setState]=useState({reflection:old.reflection||'',keyTakeaway:old.keyTakeaway||'',commitment:old.commitment||''});
 return <Frame submit={async()=>{await save(state);onSaved()}}><label className="block text-sm font-medium">Refleksi<textarea required value={state.reflection} onChange={e=>setState({...state,reflection:e.target.value})} className={"mt-1 "+area} placeholder="Apa yang paling penting dari sesi ini?"/></label><label className="block text-sm font-medium">Key Takeaway<textarea value={state.keyTakeaway} onChange={e=>setState({...state,keyTakeaway:e.target.value})} className={"mt-1 "+area}/></label><label className="block text-sm font-medium">Commitment<textarea value={state.commitment} onChange={e=>setState({...state,commitment:e.target.value})} className={"mt-1 "+area}/></label><p className="text-xs leading-5 text-slate-500">Refleksi pribadi ditandai private di sistem.</p></Frame>
}

function Aar({activity,save,onSaved}:Props){
 const old=activity.submission?.payload||{};const fields=[['whatHappened','What happened?'],['whatWorked','What worked?'],['whatToImprove','What can be improved?'],['stop','STOP'],['start','START'],['continue','CONTINUE']] as const;const[state,setState]=useState<Record<string,string>>(()=>Object.fromEntries(fields.map(([k])=>[k,old[k]||''])));
 return <Frame submit={async()=>{await save(state);onSaved()}}>{fields.map(([k,l])=><label key={k} className="block text-sm font-medium">{l}<textarea required value={state[k]} onChange={e=>setState({...state,[k]:e.target.value})} className={"mt-1 "+area}/></label>)}</Frame>
}

export default function StructuredTools(props:Props){
 switch(props.activity.type){
  case'MINUTE_AUDIT':return <MinuteAudit {...props}/>;
  case'DAILY_BIG_3':return <Big3 {...props}/>;
  case'MEETING_CHECKLIST':return <Meeting {...props}/>;
  case'DELEGATION_CONTRACT':return <Delegation {...props}/>;
  case'RACI_BUILDER':return <Raci {...props}/>;
  case'GROW_COACHING':return <Grow {...props}/>;
  case'SBI_FEEDBACK':return <Sbi {...props}/>;
  case'FACT_ASSUMPTION_OPINION_UNKNOWN':return <FactSeparator {...props}/>;
  case'FIVE_WHYS':return <FiveWhys {...props}/>;
  case'FISHBONE':return <Fishbone {...props}/>;
  case'ISSUE_TREE':return <IssueTree {...props}/>;
  case'BIAS_CHECKLIST':return <Bias {...props}/>;
  case'DECISION_MATRIX':return <DecisionMatrix {...props}/>;
  case'PRE_MORTEM':return <PreMortem {...props}/>;
  case'DECISION_LOG':return <DecisionLog {...props}/>;
  case'ACTION_TRACKER':return <ActionTracker {...props}/>;
  case'REFLECTION':return <Reflection {...props}/>;
  case'AAR_STOP_START_CONTINUE':return <Aar {...props}/>;
  default:return null;
 }
}
