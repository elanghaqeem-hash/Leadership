'use client';

import { useEffect, useRef } from 'react';

type Scope={batchId?:string;activityId?:string};

export function useRealtimeSubscription(scope:Scope,onChange:()=>void,fallbackMs=5000){
  const callbackRef=useRef(onChange);
  callbackRef.current=onChange;

  useEffect(()=>{
    let ws:WebSocket|null=null;
    let source:EventSource|null=null;
    let fallback:ReturnType<typeof setInterval>|null=null;
    let closed=false;
    let fallbackStarted=false;
    const invoke=()=>callbackRef.current();
    const query=scope.activityId?'activityId='+encodeURIComponent(scope.activityId!):'batchId='+encodeURIComponent(scope.batchId||'');

    const startPoll=()=>{
      if(fallback||closed)return;
      fallback=setInterval(invoke,fallbackMs);
    };
    const startSse=()=>{
      if(source||closed)return;
      const path=scope.activityId?'/api/realtime/activities/'+scope.activityId:'/api/realtime/batches/'+scope.batchId;
      if(typeof EventSource==='undefined'){startPoll();return;}
      source=new EventSource(path);
      source.addEventListener('change',invoke);
      source.addEventListener('ready',()=>{
        if(fallback)clearInterval(fallback);
        fallback=null;
      });
      source.onerror=()=>startPoll();
    };
    const fallbackToSse=()=>{
      if(fallbackStarted||closed)return;
      fallbackStarted=true;
      ws?.close();ws=null;
      startSse();
    };

    const wsEnabled=process.env.NEXT_PUBLIC_REALTIME_WS_ENABLED==='1'&&typeof WebSocket!=='undefined';
    if(wsEnabled){
      fetch('/api/realtime/token?'+query,{cache:'no-store'})
        .then(async r=>{
          if(!r.ok)throw new Error('token');
          const d=await r.json();
          if(closed)return;
          const proto=window.location.protocol==='https:'?'wss:':'ws:';
          const base=process.env.NEXT_PUBLIC_REALTIME_WS_URL||proto+'//'+window.location.host;
          ws=new WebSocket(base.replace(/\/$/,'')+(d.path||'/ws/realtime')+'?token='+encodeURIComponent(d.token));
          ws.onmessage=(event)=>{
            try{const msg=JSON.parse(String(event.data));if(msg.event==='change')invoke();}
            catch{/* ignore malformed server messages */}
          };
          ws.onopen=()=>{
            if(fallback)clearInterval(fallback);
            fallback=null;
          };
          ws.onerror=fallbackToSse;
          ws.onclose=()=>{if(!closed)fallbackToSse();};
        })
        .catch(fallbackToSse);
    }else startSse();

    return()=>{
      closed=true;
      ws?.close();
      source?.close();
      if(fallback)clearInterval(fallback);
    };
  },[scope.batchId,scope.activityId,fallbackMs]);
}
