import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { jsonError } from '@/lib/http';

export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  try {
    const { batchId } = await params;
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      select: { id: true, tenantId: true, code: true, name: true, status: true, startDate: true, endDate: true },
    });
    if (!batch) return NextResponse.json({ error: 'Batch tidak ditemukan' }, { status: 404 });

    const user = await assertPermission('BATCH_ACTIVITY_READ', { tenantId: batch.tenantId, batchId });
    const membership = await prisma.batchMembership.findUnique({
      where: { batchId_userId: { batchId, userId: user.id } },
      select: { role: true, teamId: true, isActive: true },
    });

    const activities = await prisma.activity.findMany({
      where: { batchId },
      include: {
        session: { select: { code: true, title: true, sequence: true } },
      },
      orderBy: [{ sequence: 'asc' }],
    });

    const contentCodes = activities
      .map((a) => {
        const cfg = a.config as { contentCode?: unknown };
        return typeof cfg?.contentCode === 'string' ? cfg.contentCode : null;
      })
      .filter((x): x is string => Boolean(x));
    const contentItems = contentCodes.length
      ? await prisma.contentItem.findMany({
          where: { code: { in: [...new Set(contentCodes)] }, isPublished: true, OR: [{ tenantId: null }, { tenantId: batch.tenantId }] },
          select: { code: true, type: true, title: true, version: true, payload: true },
        })
      : [];

    const submissions = membership?.role === 'PARTICIPANT'
      ? await prisma.submission.findMany({
          where: { batchId, userId: user.id, ownerType: 'USER' },
          select: { activityId: true, payload: true, score: true, scoreDetail: true, submittedAt: true, updatedAt: true, version: true },
        })
      : [];

    const byActivity = new Map(submissions.map((s) => [s.activityId, s]));
    return NextResponse.json({
      batch,
      membership,
      content: Object.fromEntries(contentItems.map((item) => [item.code, item])),
      activities: activities.map((a) => ({
        id: a.id,
        type: a.type,
        title: a.title,
        sequence: a.sequence,
        status: a.status,
        config: a.config,
        contentVersion: a.contentVersion,
        session: a.session,
        submission: byActivity.get(a.id) ?? null,
      })),
    });
  } catch (e) {
    return jsonError(e);
  }
}
