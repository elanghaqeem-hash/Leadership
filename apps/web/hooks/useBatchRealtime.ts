'use client';

import { useRealtimeSubscription } from './useRealtimeSubscription';

export function useBatchRealtime(batchId:string,onChange:()=>void,fallbackMs=5000){
  useRealtimeSubscription({batchId},onChange,fallbackMs);
}
