import { EventEmitter } from 'node:events';

type BatchEvent = {
  batchId: string;
  type: string;
  resourceId?: string;
  at: string;
};

type GlobalRealtime = typeof globalThis & {
  __ltwRealtimeBus?: EventEmitter;
};

function bus() {
  const g = globalThis as GlobalRealtime;
  if (!g.__ltwRealtimeBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(250);
    g.__ltwRealtimeBus = emitter;
  }
  return g.__ltwRealtimeBus;
}

export function publishBatchEvent(batchId: string, type: string, resourceId?: string) {
  const event: BatchEvent = { batchId, type, resourceId, at: new Date().toISOString() };
  bus().emit('batch:' + batchId, event);
}

export function subscribeBatchEvent(batchId: string, listener: (event: BatchEvent) => void) {
  const channel = 'batch:' + batchId;
  bus().on(channel, listener);
  return () => bus().off(channel, listener);
}
