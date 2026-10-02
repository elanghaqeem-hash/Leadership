'use client';

import { useEffect, useMemo, useState } from 'react';
import { useBatchRealtime } from '@/hooks/useBatchRealtime';

type Diagnostic={ratings:Record<string,number>|null;score:number|null;submittedAt:string|null}|null;
type Feed={
  batch:{id:string;code:string;name:string;status:string};
  team:null|{name:string;number:number};
  diagnostic:{pre:Diagnostic;post:Diagnostic};
  test:{pre:null|{score:number};post:null|{score:number};gain:number|null};
  l1:null|{averageScore:number|null};
  badges:Array<{activityId:string;type:string;title:string;earned:boolean;status:string}>;
  plan:null|{
    status:string;reviewD7:string;reviewD14:string;reviewD30:string;
    countdown:{d7:number;d14:number;d30:number};
    targets:Array<{sequence:number;behavior:string}>;
    followUps:Array<{kind:string;progressPct:number;statusLabel:string;submittedAt:string|null}>;
  };
  completion:{individualSubmissions:number;individualActivityCount:number;gamesParticipated:number;totalGames:number};
};

function point(index:number,count:number,value:number,radius=108,center=145){
  const angle=-Math.PI/2+index*2*Math.PI/count;
  const r=radius*Math.max(0,Math.min(5,value))/5;
  return [center+Math.cos(angle)*r,center+Math.sin(angle)*r] as const;
}
function polygon(values:number[],count:number,radius=108){
  return values.map((v,i)=>point(i,count,v,radius).join(',')).join(' ');
}

function Radar({pre,post}:{pre:Record<string,number>|null;post:Record<string,number>|null}){
  const dimensions=[...new Set([...Object.keys(pre||{}),...Object.keys(post||{})])];
  if(dimensions.length<3)return <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">Radar akan tampil setelah Self-Diagnostic tersedia.</div>;
  const preValues=dimensions.map(d=>pre?.[d]??0),postValues=dimensions.map(d=>post?.[d]??0);
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
    <div className="mb-2 flex items-center gap-4 px-2 text-xs text-slate-500"><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-navy"/>Pre</span><span className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full bg-teal"/>Post</span></div>
    <svg viewBox="0 0 290 310" role="img" aria-label="Radar Self-Diagnostic Pre versus Post" className="mx-auto w-full max-w-[360px]">
      {[1,2,3,4,5].map(level=><polygon key={level} points={polygon(Array(dimensions.length).fill(level),dimensions.length)} fill="none" stroke="#d7dde5" strokeWidth="0.8"/>)}
      {dimensions.map((d,i)=>{const [x,y]=point(i,dimensions.length,5);const [lx,ly]=point(i,dimensions.length,5,126);return <g key={d}><line x1="145" y1="145" x2={x} y2={y} stroke="#e2e8f0" strokeWidth="0.8"/><text x={lx} y={ly} textAnchor={lx<137?'end':lx>153?'start':'middle'} dominantBaseline="middle" fontSize="7.5" fill="#475569">{d.length>20?d.slice(0,18)+'…':d}</text></g>})}
      <polygon points={polygon(preValues,dimensions.length)} fill="#10243E" fillOpacity="0.10" stroke="#10243E" strokeWidth="2"/>
      <polygon points={polygon(postValues,dimensions.length)} fill="#1E7F86" fillOpacity="0.16" stroke="#1E7F86" strokeWidth="2"/>
      {postValues.map((v,i)=>{const [x,y]=point(i,dimensions.length,v);return <circle key={i} cx={x} cy={y} r="3" fill="#1E7F86"/>})}
    </svg>
  </div>;
}

function Countdown({label,days,date}:{label:string;days:number;date:string}){
  const state=days>0?days+' hari lagi':days===0?'Hari ini':Math.abs(days)+' hari lalu';
  return <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 font-semibold text-navy">{state}</div><div className="text-xs text-slate-500">{new Date(date).toLocaleDateString('id-ID')}</div></div>;
}

export default function ParticipantImpactDashboardClient({batchId,userId}:{batchId:string;userId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');
 async function load(){const r=await fetch('/api/participant/batches/'+batchId+'/dashboard',{cache:'no-store'});const d=await r.json();if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat dashboard')}
 useEffect(()=>{void load()},[batchId]);useBatchRealtime(batchId,load,5000);
 const pre=feed?.diagnostic.pre?.ratings||null,post=feed?.diagnostic.post?.ratings||null;
 const testGain=feed?.test.gain;
 const gamePct=useMemo(()=>feed&&feed.completion.totalGames?Math.round(feed.completion.gamesParticipated/feed.completion.totalGames*100):0,[feed]);
 if(!feed)return <div className="p-6 text-sm text-slate-600">{error||'Memuat dashboard participant…'}</div>;
 return <div className="space-y-5">
   <section className="rounded-3xl bg-navy p-5 text-white shadow-lg">
     <div className="text-xs font-bold uppercase tracking-[.18em] text-amber-300">My Leadership Impact</div>
     <h2 className="mt-2 text-2xl font-semibold">{feed.batch.name}</h2>
     <p className="mt-1 text-sm text-slate-300">{feed.batch.code}{feed.team?' · '+feed.team.name:''}</p>
     <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
       <div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-slate-400">Pre-Test</div><div className="mt-1 text-2xl font-bold">{feed.test.pre?.score??'-'}</div></div>
       <div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-slate-400">Post-Test</div><div className="mt-1 text-2xl font-bold">{feed.test.post?.score??'-'}</div></div>
       <div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-slate-400">Gain</div><div className="mt-1 text-2xl font-bold text-emerald-300">{testGain===null||testGain===undefined?'-':(testGain>=0?'+':'')+testGain}</div></div>
       <div className="rounded-xl bg-white/5 p-3"><div className="text-xs text-slate-400">L1</div><div className="mt-1 text-2xl font-bold text-amber-300">{feed.l1?.averageScore?.toFixed(2)??'-'}</div></div>
     </div>
     <div className="mt-4 flex flex-wrap gap-2"><a href={'/api/reports/batches/'+batchId+'/participants/'+userId} className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold ring-1 ring-white/15">Rapor PDF ↓</a>{feed.test.post&&<a href={'/api/reports/batches/'+batchId+'/participants/'+userId+'/certificate'} className="rounded-full bg-amber-300 px-3 py-1.5 text-xs font-bold text-slate-950">Sertifikat PDF ↓</a>}</div>
   </section>

   <section><div className="mb-3 flex items-center justify-between"><h3 className="text-lg font-semibold text-navy">Self-Diagnostic Pre vs Post</h3><span className="text-xs text-slate-500">Skala 1–5</span></div><Radar pre={pre} post={post}/></section>

   <section className="rounded-2xl border border-slate-200 bg-white p-4">
     <div className="flex items-center justify-between"><h3 className="font-semibold text-navy">Game Progress</h3><b className="text-teal">{feed.completion.gamesParticipated}/{feed.completion.totalGames}</b></div>
     <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-teal" style={{width:gamePct+'%'}}/></div>
     <div className="mt-4 grid gap-2 sm:grid-cols-2">{feed.badges.map(b=><div key={b.activityId} className={`rounded-xl border p-3 text-sm ${b.earned?'border-emerald-200 bg-emerald-50':'border-slate-200 bg-slate-50'}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold text-slate-800">{b.title}</span><span className={`text-xs font-bold ${b.earned?'text-emerald-700':'text-slate-400'}`}>{b.earned?'Badge earned':'Belum'}</span></div></div>)}</div>
   </section>

   {feed.plan?<section className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between"><h3 className="font-semibold text-navy">30-Day Plan</h3><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700">{feed.plan.status}</span></div>
      <div className="mt-4 grid grid-cols-3 gap-2"><Countdown label="D+7" days={feed.plan.countdown.d7} date={feed.plan.reviewD7}/><Countdown label="D+14" days={feed.plan.countdown.d14} date={feed.plan.reviewD14}/><Countdown label="D+30" days={feed.plan.countdown.d30} date={feed.plan.reviewD30}/></div>
      <div className="mt-4 space-y-2">{feed.plan.targets.map(t=><div key={t.sequence} className="rounded-xl bg-slate-50 p-3 text-sm"><span className="font-bold text-teal">Target {t.sequence}</span><div className="mt-1 font-medium text-slate-800">{t.behavior}</div></div>)}</div>
   </section>:<section className="rounded-2xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">30-Day Plan belum diaktifkan.</section>}
   {error&&<div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</div>}
 </div>
}
