import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { subscribeBatchEvent } from '@/lib/realtime';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  try {
    const { activityId } = await params;
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { id: true, tenantId: true, batchId: true },
    });
    if (!activity) return new Response(JSON.stringify({ error: 'Aktivitas tidak ditemukan' }), { status: 404 });

    await assertPermission('BATCH_ACTIVITY_READ', { tenantId: activity.tenantId, batchId: activity.batchId });

    const encoder = new TextEncoder();
    let cleanup: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };
        send('ready', { activityId, batchId: activity.batchId, at: new Date().toISOString() });
        cleanup = subscribeBatchEvent(activity.batchId, (event) => {
          if (!event.resourceId || event.resourceId === activityId || event.type === 'ACTIVITY_STATUS') send('change', event);
        });
        heartbeat = setInterval(() => {
          try { controller.enqueue(encoder.encode(': heartbeat\n\n')); } catch { /* closed */ }
        }, 15_000);
        req.signal.addEventListener('abort', () => {
          cleanup?.(); cleanup = null;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          try { controller.close(); } catch { /* already closed */ }
        }, { once: true });
      },
      cancel() {
        cleanup?.(); cleanup = null;
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
