import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { subscribeBatchEvent } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await params;
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true, tenantId: true },
    });
    if (!batch) return new Response(JSON.stringify({ error: 'Batch tidak ditemukan' }), { status: 404 });

    await assertPermission('BATCH_ACTIVITY_READ', { tenantId: batch.tenantId, batchId });

    const encoder = new TextEncoder();
    let cleanup: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        send('ready', { batchId, at: new Date().toISOString() });
        cleanup = subscribeBatchEvent(batchId, (event) => send('change', event));
        heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
        }, 15_000);

        req.signal.addEventListener('abort', () => {
          cleanup?.();
          cleanup = null;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          try { controller.close(); } catch { /* already closed */ }
        }, { once: true });
      },
      cancel() {
        cleanup?.();
        cleanup = null;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
