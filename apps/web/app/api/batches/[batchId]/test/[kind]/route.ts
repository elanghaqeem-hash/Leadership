import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

type AttemptKind = 'PRE' | 'POST';

const submitSchema = z.object({
  answers: z.record(z.string(), z.enum(['A','B','C','D','a','b','c','d',''])),
});

function normalizeKind(raw: string): AttemptKind | null {
  const value = raw.toUpperCase();
  return value === 'PRE' || value === 'POST' ? value : null;
}

function shuffle<T>(input: T[]): T[] {
  const out = [...input];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

async function context(batchId: string, kind: AttemptKind) {
  const user = await requireUser();
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    select: { id: true, tenantId: true, name: true },
  });
  if (!batch) return { error: NextResponse.json({ error: 'Batch tidak ditemukan' }, { status: 404 }) } as const;

  const actor = await assertPermission('OWN_SUBMISSION_WRITE', {
    tenantId: batch.tenantId,
    batchId,
    resourceUserId: user.id,
  });

  const activity = await prisma.activity.findFirst({
    where: { batchId, type: kind === 'PRE' ? 'PRE_TEST' : 'POST_TEST' },
    select: { id: true, status: true, config: true },
  });
  if (!activity) return { error: NextResponse.json({ error: 'Aktivitas test belum tersedia' }, { status: 404 }) } as const;

  const test = await prisma.test.findFirst({
    where: { tenantId: null, code: 'LTW_PRE_POST', version: 1 },
    include: { questions: { orderBy: { sequence: 'asc' } } },
  });
  if (!test) return { error: NextResponse.json({ error: 'Bank soal belum tersedia' }, { status: 409 }) } as const;

  return { actor, batch, activity, test } as const;
}

export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string; kind: string }> }) {
  try {
    const { batchId, kind: rawKind } = await params;
    const kind = normalizeKind(rawKind);
    if (!kind) return NextResponse.json({ error: 'Jenis test harus PRE atau POST' }, { status: 400 });

    const ctx = await context(batchId, kind);
    if ('error' in ctx) return ctx.error;
    const { actor, activity, test } = ctx;

    let attempt = await prisma.testAttempt.findUnique({
      where: { testId_userId_batchId_kind: { testId: test.id, userId: actor.id, batchId, kind } },
    });

    if (!attempt) {
      if (activity.status !== 'OPEN') {
        return NextResponse.json({ error: 'Test belum dibuka oleh trainer' }, { status: 409 });
      }
      const order = shuffle(test.questions.map((q) => q.code));
      attempt = await prisma.testAttempt.create({
        data: {
          testId: test.id,
          userId: actor.id,
          batchId,
          kind,
          answers: { order, responses: {} },
          score: 0,
          startedAt: new Date(),
        },
      });
    }

    const stored = attempt.answers as unknown as { order?: string[]; responses?: Record<string,string> };
    const order = stored.order?.length === test.questions.length ? stored.order : test.questions.map((q) => q.code);
    const byCode = new Map(test.questions.map((q) => [q.code, q]));
    const orderedQuestions = order.map((code) => byCode.get(code)).filter(Boolean).map((q) => ({
      id: q!.id,
      code: q!.code,
      prompt: q!.prompt,
      options: q!.options,
      points: q!.points,
    }));
    const durationSec = test.durationSec ?? 1200;
    const elapsedSec = Math.floor((Date.now() - attempt.startedAt.getTime()) / 1000);
    const remainingSec = Math.max(0, durationSec - elapsedSec);

    return NextResponse.json({
      test: { id: test.id, name: test.name, kind, durationSec },
      activity: { id: activity.id, status: activity.status },
      attempt: {
        id: attempt.id,
        startedAt: attempt.startedAt,
        submittedAt: attempt.submittedAt,
        remainingSec,
        expired: remainingSec === 0 && !attempt.submittedAt,
        score: attempt.submittedAt ? attempt.score : null,
        responses: stored.responses ?? {},
      },
      questions: orderedQuestions,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ batchId: string; kind: string }> }) {
  try {
    const { batchId, kind: rawKind } = await params;
    const kind = normalizeKind(rawKind);
    if (!kind) return NextResponse.json({ error: 'Jenis test harus PRE atau POST' }, { status: 400 });

    const input = submitSchema.parse(await req.json());
    const ctx = await context(batchId, kind);
    if ('error' in ctx) return ctx.error;
    const { actor, activity, test } = ctx;
    if (activity.status !== 'OPEN') {
      return NextResponse.json({ error: 'Test belum dibuka atau sudah dikunci' }, { status: 409 });
    }

    const attempt = await prisma.testAttempt.findUnique({
      where: { testId_userId_batchId_kind: { testId: test.id, userId: actor.id, batchId, kind } },
    });
    if (!attempt) return NextResponse.json({ error: 'Mulai test terlebih dahulu' }, { status: 409 });
    if (attempt.submittedAt) {
      return NextResponse.json({ error: 'Test sudah dikirim', score: attempt.score }, { status: 409 });
    }

    const stored = attempt.answers as unknown as { order?: string[] };
    const responses = Object.fromEntries(
      Object.entries(input.answers).map(([code, answer]) => [code, answer.toUpperCase()]),
    );
    let score = 0;
    for (const q of test.questions) {
      if ((responses[q.code] || '') === q.answerKey.toUpperCase()) score += q.points;
    }
    const durationSec = test.durationSec ?? 1200;
    const timedOut = Date.now() > attempt.startedAt.getTime() + durationSec * 1000;

    const updated = await prisma.testAttempt.update({
      where: { id: attempt.id },
      data: {
        answers: { order: stored.order ?? test.questions.map((q) => q.code), responses } as Prisma.InputJsonValue,
        score,
        submittedAt: new Date(),
      },
    });

    const pre = kind === 'POST'
      ? await prisma.testAttempt.findUnique({
          where: { testId_userId_batchId_kind: { testId: test.id, userId: actor.id, batchId, kind: 'PRE' } },
          select: { score: true, submittedAt: true },
        })
      : null;

    return NextResponse.json({
      ok: true,
      score: updated.score,
      maxScore: test.questions.reduce((sum, q) => sum + q.points, 0),
      gain: kind === 'POST' && pre?.submittedAt ? updated.score - pre.score : null,
      timedOut,
      submittedAt: updated.submittedAt,
    });
  } catch (e) {
    return jsonError(e);
  }
}
