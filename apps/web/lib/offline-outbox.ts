'use client';

type OutboxItem = {
  id: string;
  activityId: string;
  url: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  attempts: number;
  lastError?: string;
};

const DB_NAME='ltw-offline-v1';
const DB_VERSION=1;
const STORE='activity-outbox';
const MAX_AGE_MS=24*60*60*1000;

function openDb():Promise<IDBDatabase>{
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const db=request.result;
      if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function withStore<T>(mode:IDBTransactionMode,fn:(store:IDBObjectStore)=>IDBRequest<T>):Promise<T>{
  const db=await openDb();
  try{
    return await new Promise<T>((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      const request=fn(tx.objectStore(STORE));
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      tx.onerror=()=>reject(tx.error);
    });
  }finally{db.close();}
}

function notify(){if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent('ltw:outbox-change'));}

export async function queueActivitySubmission(activityId:string,payload:unknown){
  const now=Date.now();
  const item:OutboxItem={
    id:'activity:'+activityId,
    activityId,
    url:'/api/activities/'+activityId+'/submission',
    body:JSON.stringify({payload}),
    createdAt:now,
    updatedAt:now,
    attempts:0,
  };
  await withStore('readwrite',store=>store.put(item));
  notify();
}

export async function outboxItems():Promise<OutboxItem[]>{
  if(typeof indexedDB==='undefined')return[];
  const rows=await withStore<OutboxItem[]>('readonly',store=>store.getAll());
  const now=Date.now();
  const expired=rows.filter(x=>now-x.createdAt>MAX_AGE_MS);
  if(expired.length){
    const db=await openDb();
    try{
      const tx=db.transaction(STORE,'readwrite');
      for(const item of expired)tx.objectStore(STORE).delete(item.id);
      await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});
    }finally{db.close();}
  }
  return rows.filter(x=>now-x.createdAt<=MAX_AGE_MS).sort((a,b)=>a.createdAt-b.createdAt);
}

export async function outboxCount(){return (await outboxItems()).length;}

async function updateItem(item:OutboxItem){
  await withStore('readwrite',store=>store.put(item));
  notify();
}

async function deleteItem(id:string){
  await withStore('readwrite',store=>store.delete(id));
  notify();
}

export async function submitActivityResilient(activityId:string,payload:unknown){
  if(typeof navigator!=='undefined'&&!navigator.onLine){
    await queueActivitySubmission(activityId,payload);
    return{ok:true,queued:true};
  }
  try{
    const response=await fetch('/api/activities/'+activityId+'/submission',{
      method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({payload}),
    });
    const data=await response.json();
    if(!response.ok)throw Object.assign(new Error(data.error||'Gagal menyimpan jawaban'),{httpStatus:response.status});
    await deleteItem('activity:'+activityId).catch(()=>undefined);
    return{...data,queued:false};
  }catch(error:any){
    if(typeof error?.httpStatus==='number')throw error;
    await queueActivitySubmission(activityId,payload);
    return{ok:true,queued:true};
  }
}

export async function flushActivityOutbox(){
  const rows=await outboxItems();
  let synced=0;
  let blocked=0;
  for(const item of rows){
    try{
      const response=await fetch(item.url,{method:'POST',headers:{'content-type':'application/json'},body:item.body});
      if(response.ok){await deleteItem(item.id);synced++;continue;}
      if(response.status===401||response.status===403){blocked++;break;}
      const body=await response.json().catch(()=>({}));
      await updateItem({...item,attempts:item.attempts+1,updatedAt:Date.now(),lastError:body.error||'HTTP '+response.status});
      blocked++;
    }catch{
      await updateItem({...item,attempts:item.attempts+1,updatedAt:Date.now(),lastError:'NETWORK_OFFLINE'});
      blocked++;
      break;
    }
  }
  return{synced,blocked,pending:await outboxCount()};
}
