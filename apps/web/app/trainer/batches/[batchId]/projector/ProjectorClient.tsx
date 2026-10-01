'use client';

import { useEffect, useMemo, useState } from 'react';

type Activity={id:string;title:string;type:string;status:string;openedAt?:string|null};
type Session={activities:Activity[]};
type Feed={batch:{name:string;code:string;joinCode:string};participantCount:number;sessions:Session[]};
type GameFeed={round:any;card:any;aggregate:Record<string,number>|null;answer:any;choices:string[];totalVotes:number};

const LIVE_GAME_TYPES=new Set(['LEADERSHIP_MIRROR','PRIORITY_POKER','FACT_OR_FICTION']);

function mmss(seconds:number){
 const m=Math.floor(seconds/60).toString().padStart(2,'0');
 const s=(seconds%60).toString().padStart(2,'0');
 return m+':'+s;
}

export default function ProjectorClient({batchId}:{batchId:string}){
 const[feed,setFeed]=useState<Feed|null>(null);const[game,setGame]=useState<GameFeed|null>(null);const[now,setNow]=useState(Date.now());
 async function load(){
   const r=await fetch('/api/trainer/batches/'+batchId+'/session-control',{cache:'no-store'});
   const d=await r.json();
   if(r.ok){
     setFeed(d);
     const active=(d.sessions||[]).flatMap((s:any)=>s.activities||[]).find((a:any)=>a.status==='OPEN'||a.status==='REVEALED');
     if(active&&LIVE_GAME_TYPES.has(active.type)){
       const gr=await fetch('/api/games/'+active.id+'/live',{cache:'no-store'});
       const gd=await gr.json();
       setGame(gr.ok?gd:null);
     }else setGame(null);
   }
 }
 useEffect(()=>{void load();const p=setInterval(()=>void load(),1500);const t=setInterval(()=>setNow(Date.now()),1000);return()=>{clearInterval(p);clearInterval(t)}},[batchId]);
 const active=useMemo(()=>feed?.sessions.flatMap(s=>s.activities).find(a=>a.status==='OPEN'||a.status==='REVEALED')??null,[feed]);
 const elapsed=active?.openedAt?Math.max(0,Math.floor((now-new Date(active.openedAt).getTime())/1000)):0;
 const prompt=game?.card?.situation||game?.card?.prompt||game?.card?.statement||'';
 const max=game?.aggregate?Math.max(1,...Object.values(game.aggregate)):1;
 if(!feed)return <main className="flex min-h-screen items-center justify-center bg-slate-950 text-white"><div className="text-xl">Memuat Projector Mode…</div></main>;
 return <main className="min-h-screen bg-slate-950 p-6 text-white">
   <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col">
     <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-5">
       <div><div className="text-sm font-bold uppercase tracking-[.25em] text-amber-300">Leadership That Works · Projector</div><h1 className="mt-2 text-4xl font-semibold">{feed.batch.name}</h1><div className="mt-2 text-lg text-slate-400">{feed.batch.code} · Join Code <b className="text-white">{feed.batch.joinCode}</b> · {feed.participantCount} peserta</div></div>
       <div className="rounded-3xl bg-white/5 px-7 py-5 text-center ring-1 ring-white/10"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Elapsed</div><div className="mt-1 font-mono text-5xl font-bold text-amber-300">{mmss(elapsed)}</div></div>
     </header>
     {!active?<div className="flex flex-1 items-center justify-center"><div className="text-center"><div className="text-5xl">Ready</div><p className="mt-4 text-xl text-slate-400">Trainer belum membuka aktivitas.</p></div></div>:<div className="flex flex-1 flex-col justify-center py-8">
       <div className="text-sm font-bold uppercase tracking-[.2em] text-emerald-300">Aktivitas aktif</div>
       <h2 className="mt-2 text-5xl font-semibold leading-tight">{active.title}</h2>
       {game?.round&&<div className="mt-5 text-xl text-slate-400">Round {game.round.roundNo} · Kartu {game.round.cardNo} · {game.round.stage} · {game.totalVotes||0} vote</div>}
       {prompt&&<div className="mt-8 rounded-3xl bg-white/5 p-8 text-3xl font-semibold leading-relaxed ring-1 ring-white/10">{prompt}</div>}
       {game?.round?.stage==='TWIST'&&game.card?.twistPrompt&&<div className="mt-5 rounded-3xl bg-amber-400/10 p-6 text-2xl font-semibold text-amber-200 ring-1 ring-amber-400/20">TWIST · {String(game.card.twistPrompt)}</div>}
       {game?.aggregate&&<div className="mt-8 grid gap-4 md:grid-cols-2">{game.choices.map(choice=>{const count=game.aggregate?.[choice]||0;return <div key={choice} className="rounded-2xl bg-white/5 p-5 ring-1 ring-white/10"><div className="flex items-center justify-between text-2xl"><b>{choice}</b><span>{count}</span></div><div className="mt-3 h-4 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-teal" style={{width:Math.round(count/max*100)+'%'}}/></div></div>})}</div>}
       {game?.answer?.expected&&<div className="mt-8 rounded-3xl bg-emerald-400/10 p-6 text-2xl text-emerald-200 ring-1 ring-emerald-400/20"><b>Expected:</b> {String(game.answer.expected)}</div>}
     </div>}
   </div>
 </main>
}
