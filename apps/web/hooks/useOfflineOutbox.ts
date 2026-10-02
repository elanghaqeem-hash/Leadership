'use client';

import { useEffect, useState } from 'react';
import { flushActivityOutbox, outboxCount } from '@/lib/offline-outbox';

export function useOfflineOutbox(){
 const[pending,setPending]=useState(0);
 const[online,setOnline]=useState(true);

 useEffect(()=>{
  let alive=true;
  const refresh=async()=>{const count=await outboxCount().catch(()=>0);if(alive)setPending(count)};
  const sync=async()=>{setOnline(navigator.onLine);if(navigator.onLine)await flushActivityOutbox().catch(()=>undefined);await refresh()};
  const onOnline=()=>void sync();
  const onOffline=()=>setOnline(false);
  const onChange=()=>void refresh();
  setOnline(navigator.onLine);
  void sync();
  window.addEventListener('online',onOnline);
  window.addEventListener('offline',onOffline);
  window.addEventListener('ltw:outbox-change',onChange as EventListener);
  const timer=setInterval(()=>void sync(),15000);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',onOnline);window.removeEventListener('offline',onOffline);window.removeEventListener('ltw:outbox-change',onChange as EventListener)};
 },[]);

 return{pending,online,flush:async()=>{const result=await flushActivityOutbox();setPending(result.pending);return result}};
}
