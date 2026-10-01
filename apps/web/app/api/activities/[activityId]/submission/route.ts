import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { evaluatePlannerBuffer, evaluatePlannerFocus, scorePriority } from '@ltw/scoring';
import { assertPermission, requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

const bodySchema = z.object({ payload: z.unknown() });
const scale = z.number().int().min(1).max(5);

const selfDiagnosticSchema = z.object({
  ratings: z.record(z.string(), scale),
});

const priorityItemSchema = z.object({
  id: z.string().min(1).max(80).optional(),
  activity: z.string().min(1).max(300),
  urgency: scale,
  business: scale,
  customer: scale,
  risk: scale,
  compliance: scale,
  strategic: scale,
});
const prioritySchema = z.object({ items: z.array(priorityItemSchema).min(1).max(50) });

const plannerSchema = z.object({
  slots: z.array(z.object({
    day: z.string().min(1).max(20),
    time: z.string().min(1).max(20),
    category: z.enum(['Focus','Meeting','Customer','People/Coaching','Admin/Batch','Buffer','Break']),
    note: z.string().max(300).optional().default(''),
  })).max(300),
});

function ensurePayloadSize(payload: unknown) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > 64 * 1024) throw new Error('Submission payload exceeds 64 KB');
}

export async function POST(req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  try {
    const { activityId } = await params;
    const { payload } = bodySchema.parse(await req.json());
    ensurePayloadSize(payload);

    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { id: true, tenantId: true, batchId: true, type: true, status: true, config: true },
    });
    if (!activity) return NextResponse.json({ error: 'Aktivitas tidak ditemukan' }, { status: 404 });

    const currentUser = await requireUser();
    const actor = await assertPermission('OWN_SUBMISSION_WRITE', {
      tenantId: activity.tenantId,
      batchId: activity.batchId,
      resourceUserId: currentUser.id,
    });

    if (activity.status !== 'OPEN') {
      return NextResponse.json({ error: 'Aktivitas belum dibuka atau sudah dikunci' }, { status: 409 });
    }

    let normalized: unknown = payload;
    let score: number | null = null;
    let scoreDetail: Prisma.InputJsonValue | undefined;

    if (activity.type === 'SELF_DIAGNOSTIC') {
      const parsed = selfDiagnosticSchema.parse(payload);
      const values = Object.values(parsed.ratings);
      if (values.length !== 10) {
        return NextResponse.json({ error: 'Self-Diagnostic harus berisi 10 dimensi' }, { status: 400 });
      }
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      normalized = parsed;
      score = average;
      scoreDetail = { average, ratings: parsed.ratings };
    } else if (activity.type === 'PRIORITY_SCORECARD') {
      const parsed = prioritySchema.parse(payload);
      const results = parsed.items.map((item) => ({
        ...item,
        result: scorePriority({
          urgency:item.urgency,
          business:item.business,
          customer:item.customer,
          risk:item.risk,
          compliance:item.compliance,
          strategic:item.strategic,
        }),
      }));
      normalized = { items: parsed.items };
      scoreDetail = { items: results } as Prisma.InputJsonValue;
    } else if (activity.type === 'WEEKLY_PLANNER') {
      const parsed = plannerSchema.parse(payload);
      const nonBreakSlots = parsed.slots.filter((s) => s.category !== 'Break').length;
      const bufferSlots = parsed.slots.filter((s) => s.category === 'Buffer').length;
      const focusSlots = parsed.slots.filter((s) => s.category === 'Focus').length;
      const nonBreakMinutes = nonBreakSlots * 30;
      const summary = nonBreakMinutes > 0
        ? {
            buffer: evaluatePlannerBuffer(nonBreakMinutes, bufferSlots * 30),
            focus: evaluatePlannerFocus(nonBreakMinutes, focusSlots * 30),
            categorizedMinutes: nonBreakMinutes,
          }
        : { buffer: null, focus: null, categorizedMinutes: 0 };
      normalized = parsed;
      scoreDetail = summary as Prisma.InputJsonValue;
    }

    const isPrivateReflection = activity.type === 'REFLECTION';
    const submissionKey = `${activity.id}:${actor.id}`;
    const submission = await prisma.submission.upsert({
      where: { submissionKey },
      create: {
        tenantId: activity.tenantId,
        batchId: activity.batchId,
        activityId: activity.id,
        ownerType: 'USER',
        userId: actor.id,
        submissionKey,
        payload: normalized as Prisma.InputJsonValue,
        score,
        scoreDetail,
        isPrivateReflection,
        submittedAt: new Date(),
      },
      update: {
        payload: normalized as Prisma.InputJsonValue,
        score,
        scoreDetail,
        isPrivateReflection,
        submittedAt: new Date(),
        version: { increment: 1 },
      },
    });

    return NextResponse.json({
      ok: true,
      submission: {
        id: submission.id,
        version: submission.version,
        score: submission.score,
        scoreDetail: submission.scoreDetail,
        submittedAt: submission.submittedAt,
      },
    });
  } catch (e) {
    return jsonError(e);
  }
}
