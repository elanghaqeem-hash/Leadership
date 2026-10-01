'use client';

import { useEffect } from 'react';

export function useBatchRealtime(batchId: string, onChange: () => void, fallbackMs = 5000) {
  useEffect(() => {
    let source: EventSource | null = null;
    let fallback: ReturnType<typeof setInterval> | null = null;
    let closed = false;

    const startFallback = () => {
      if (fallback || closed) return;
      fallback = setInterval(onChange, fallbackMs);
    };

    if (typeof EventSource !== 'undefined') {
      source = new EventSource('/api/realtime/batches/' + batchId);
      source.addEventListener('change', onChange);
      source.addEventListener('ready', () => {
        if (fallback) clearInterval(fallback);
        fallback = null;
      });
      source.onerror = () => startFallback();
    } else {
      startFallback();
    }

    return () => {
      closed = true;
      source?.close();
      if (fallback) clearInterval(fallback);
    };
  }, [batchId, onChange, fallbackMs]);
}
