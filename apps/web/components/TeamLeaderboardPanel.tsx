'use client';

import { useEffect, useState } from 'react';
import { useBatchRealtime } from '@/hooks/useBatchRealtime';

type GameRow={code:string;title:string;type:string;source:string;complete:boolean;nativeScore:number|null;rank:number|null;rankPoints:number};
type Row={rank:number;team:{id:string;name:string;number:number};rankPoints:number;scoredGames:number;completedGames:number;perGame:GameRow[]};
type Feed={meta:{method:string;operationalOnly:boolean;note:string;tracked:string[]};overall:Row[]};

export default function TeamLeaderboardPanel({batchId,compact=false}:{batchId:string;compact?:boolean}){
  const[feed,setFeed]=useState<Feed|null>(null);const[error,setError]=useState('');
  async function load(){
    const r=await fetch('/api/batches/'+batchId+'/leaderboard',{cache:'no-store'});
    const d=await r.json();
    if(r.ok){setFeed(d);setError('')}else setError(d.error||'Gagal memuat leaderboard');
  }
  useEffect(()=>{void load()},[batchId]);
  useBatchRealtime(batchId,load,4000);

  if(!feed)return <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-400">{error||'Memuat leaderboard…'}</div>;
  return <section className="rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="text-xs font-bold uppercase tracking-[.16em] text-amber-300">Live Team Leaderboard</div><div className="mt-1 text-xs text-slate-400">Rank points · operational engagement, bukan nilai evaluasi formal</div></div>
      <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-300">{feed.meta.tracked.join(' · ')}</div>
    </div>
    <div className="mt-3 space-y-2">
      {feed.overall.map(row=><div key={row.team.id} className="rounded-xl bg-black/20 px-3 py-2">
        <div className="flex items-center justify-between gap-3"><div className="font-semibold text-white">#{row.rank} · {row.team.name}</div><div className="text-sm font-bold text-amber-300">{row.rankPoints} pts</div></div>
        {!compact&&<div className="mt-2 flex flex-wrap gap-1.5">{row.perGame.map(g=><span key={g.type} className="rounded-full bg-white/5 px-2 py-1 text-[10px] text-slate-300">{g.code}: {g.source==='COMPLETION_ONLY'?(g.complete?'done':'—'):(g.rank?'#'+g.rank:'—')}</span>)}</div>}
      </div>)}
    </div>
    {error&&<div className="mt-2 text-xs text-red-300">{error}</div>}
  </section>;
}
