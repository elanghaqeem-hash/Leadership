'use client';

import { useRealtimeSubscription } from './useRealtimeSubscription';

export function useActivityRealtime(activityId:string,onChange:()=>void,fallbackMs=5000){
  useRealtimeSubscription({activityId},onChange,fallbackMs);
}
