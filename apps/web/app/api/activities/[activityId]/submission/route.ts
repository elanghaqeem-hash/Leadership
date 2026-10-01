import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { actionTrackerSummary, evaluatePlannerBuffer, evaluatePlannerFocus, scorePriority, validateRaciRow } from '@ltw/scoring';
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

const minuteAuditSchema = z.object({
  items: z.array(z.object({
    activity: z.string().trim().min(1).max(500),
    durationMin: z.number().int().min(1).max(480),
    category: z.enum(['Focus','Meeting','Customer','People/Coaching','Admin/Batch','Buffer','Break','Other']),
  })).min(1).max(100),
});
const dailyBig3Schema = z.object({ items: z.array(z.string().trim().min(1).max(300)).length(3) });
const meetingSchema = z.object({
  purpose: z.string().trim().min(1).max(500),
  decisionRequired: z.boolean(),
  rightParticipants: z.boolean(),
  preReadReady: z.boolean(),
  timeboxed: z.boolean(),
  canBeAsync: z.boolean(),
});
const delegationSchema = z.object({
  outcome: z.string().trim().min(1).max(1000),
  why: z.string().trim().min(1).max(1000),
  owner: z.string().trim().min(1).max(200),
  level: z.enum(['L1','L2','L3','L4','L5']),
  authorityBoundary: z.string().trim().min(1).max(1000),
  resources: z.string().trim().min(1).max(1000),
  checkpoint: z.string().trim().min(1).max(500),
  evidence: z.string().trim().min(1).max(1000),
});
const raciSchema = z.object({
  rows: z.array(z.object({
    task: z.string().trim().min(1).max(300),
    assignments: z.array(z.object({
      stakeholder: z.string().trim().min(1).max(200),
      role: z.enum(['R','A','C','I']),
    })).min(1).max(30),
  })).min(1).max(50),
});
const growSchema = z.object({
  goal: z.string().trim().min(1).max(1500),
  reality: z.string().trim().min(1).max(1500),
  options: z.string().trim().min(1).max(2000),
  will: z.string().trim().min(1).max(1500),
});
const sbiSchema = z.object({
  situation: z.string().trim().min(1).max(1000),
  behavior: z.string().trim().min(1).max(1000),
  impact: z.string().trim().min(1).max(1000),
  nextStep: z.string().trim().min(1).max(1000),
});
const factSchema = z.object({
  items: z.array(z.object({
    statement: z.string().trim().min(1).max(1000),
    type: z.enum(['FACT','ASSUMPTION','OPINION','UNKNOWN']),
    evidence: z.string().max(1000).optional().default(''),
  })).min(1).max(50),
});
const fiveWhysSchema = z.object({
  problem: z.string().trim().min(1).max(1500),
  whys: z.array(z.string().trim().min(1).max(1200)).length(5),
});
const fishboneSchema = z.object({
  problem: z.string().trim().min(1).max(1500),
  categories: z.record(z.string(), z.array(z.string().trim().min(1).max(500)).max(20)),
});
const issueTreeSchema = z.object({
  problem: z.string().trim().min(1).max(1500),
  branches: z.array(z.object({
    label: z.string().trim().min(1).max(500),
    subIssues: z.array(z.string().trim().min(1).max(500)).max(20),
  })).min(2).max(12),
});
const biasSchema = z.object({
  checks: z.array(z.object({
    bias: z.string().trim().min(1).max(200),
    flagged: z.boolean(),
    note: z.string().max(1000).optional().default(''),
  })).min(1).max(30),
});
const decisionMatrixSchema = z.object({
  criteria: z.array(z.object({
    name: z.string().trim().min(1).max(200),
    weight: z.number().positive().max(100),
  })).length(9),
  options: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    scores: z.array(scale).length(9),
  })).min(2).max(10),
  reversibility: z.enum(['REVERSIBLE','PARTLY_REVERSIBLE','IRREVERSIBLE']),
});
const preMortemSchema = z.object({
  items: z.array(z.object({
    failure: z.string().trim().min(1).max(1000),
    likelihood: scale,
    impact: scale,
    warning: z.string().trim().min(1).max(1000),
    prevention: z.string().trim().min(1).max(1000),
  })).min(1).max(30),
});
const decisionLogSchema = z.object({
  decision: z.string().trim().min(1).max(1000),
  context: z.string().trim().min(1).max(2000),
  optionsConsidered: z.string().trim().min(1).max(2000),
  selectedOption: z.string().trim().min(1).max(1000),
  rationale: z.string().trim().min(1).max(2000),
  risks: z.string().trim().min(1).max(1500),
  reversible: z.boolean(),
  owner: z.string().trim().min(1).max(200),
  reviewDate: z.string().min(8).max(30),
});
const actionTrackerSchema = z.object({
  items: z.array(z.object({
    action: z.string().max(1000).default(''),
    owner: z.string().max(200).default(''),
    deadline: z.string().max(30).default(''),
    evidence: z.string().max(1000).default(''),
    status: z.string().max(100).default(''),
  })).max(100),
});

function payloadSizeBytes(payload: unknown) {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

export async function POST(req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  try {
    const { activityId } = await params;
    const { payload } = bodySchema.parse(await req.json());
    if (payloadSizeBytes(payload) > 64 * 1024) {
      return NextResponse.json({ error: 'Submission payload maksimal 64 KB' }, { status: 413 });
    }

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
        } else if (activity.type === 'MINUTE_AUDIT') {
      const parsed = minuteAuditSchema.parse(payload);
      const totalMinutes = parsed.items.reduce((sum, item) => sum + item.durationMin, 0);
      normalized = parsed;
      scoreDetail = {
        totalMinutes,
        remainingMinutes: 480 - totalMinutes,
        status: totalMinutes > 480 ? 'OVER_480' : totalMinutes === 480 ? 'BALANCED_480' : 'UNDER_480',
        byCategory: Object.fromEntries(
          [...new Set(parsed.items.map((x) => x.category))].map((category) => [
            category,
            parsed.items.filter((x) => x.category === category).reduce((sum, x) => sum + x.durationMin, 0),
          ]),
        ),
      } as Prisma.InputJsonValue;
    } else if (activity.type === 'DAILY_BIG_3') {
      normalized = dailyBig3Schema.parse(payload);
    } else if (activity.type === 'MEETING_CHECKLIST') {
      const parsed = meetingSchema.parse(payload);
      const signals = [parsed.decisionRequired, parsed.rightParticipants, parsed.preReadReady, parsed.timeboxed, !parsed.canBeAsync];
      const goScore = signals.filter(Boolean).length;
      normalized = parsed;
      scoreDetail = { goScore, recommendation: goScore >= 4 ? 'GO' : 'NO_GO_OR_REDESIGN' };
    } else if (activity.type === 'DELEGATION_CONTRACT') {
      normalized = delegationSchema.parse(payload);
    } else if (activity.type === 'RACI_BUILDER') {
      const parsed = raciSchema.parse(payload);
      const validation = parsed.rows.map((row) => ({
        task: row.task,
        ...validateRaciRow(row.assignments.map((a) => a.role)),
      }));
      if (validation.some((row) => !row.valid)) {
        return NextResponse.json({ error: 'Setiap baris RACI wajib memiliki tepat 1 Accountable (A)', validation }, { status: 400 });
      }
      normalized = parsed;
      scoreDetail = { validation } as Prisma.InputJsonValue;
    } else if (activity.type === 'GROW_COACHING') {
      normalized = growSchema.parse(payload);
    } else if (activity.type === 'SBI_FEEDBACK') {
      const parsed = sbiSchema.parse(payload);
      normalized = parsed;
      scoreDetail = {
        generatedFeedback: `Pada ${parsed.situation}, ketika ${parsed.behavior}, dampaknya ${parsed.impact}. Ke depan, ${parsed.nextStep}.`,
      };
    } else if (activity.type === 'FACT_ASSUMPTION_OPINION_UNKNOWN') {
      normalized = factSchema.parse(payload);
    } else if (activity.type === 'FIVE_WHYS') {
      normalized = fiveWhysSchema.parse(payload);
    } else if (activity.type === 'FISHBONE') {
      normalized = fishboneSchema.parse(payload);
    } else if (activity.type === 'ISSUE_TREE') {
      normalized = issueTreeSchema.parse(payload);
    } else if (activity.type === 'BIAS_CHECKLIST') {
      const parsed = biasSchema.parse(payload);
      normalized = parsed;
      scoreDetail = { flaggedCount: parsed.checks.filter((x) => x.flagged).length };
    } else if (activity.type === 'DECISION_MATRIX') {
      const parsed = decisionMatrixSchema.parse(payload);
      const totalWeight = parsed.criteria.reduce((sum, item) => sum + item.weight, 0);
      const results = parsed.options.map((option) => ({
        name: option.name,
        weightedScore: option.scores.reduce((sum, value, idx) => sum + value * parsed.criteria[idx].weight, 0) / totalWeight,
      })).sort((a, b) => b.weightedScore - a.weightedScore);
      normalized = parsed;
      scoreDetail = { ranking: results.map((x, idx) => ({ rank: idx + 1, ...x })), reversibility: parsed.reversibility } as Prisma.InputJsonValue;
    } else if (activity.type === 'PRE_MORTEM') {
      const parsed = preMortemSchema.parse(payload);
      normalized = parsed;
      scoreDetail = { risks: parsed.items.map((x) => ({ failure: x.failure, riskScore: x.likelihood * x.impact })) } as Prisma.InputJsonValue;
    } else if (activity.type === 'DECISION_LOG') {
      normalized = decisionLogSchema.parse(payload);
    } else if (activity.type === 'ACTION_TRACKER') {
      const parsed = actionTrackerSchema.parse(payload);
      const today = new Date().toISOString().slice(0, 10);
      normalized = parsed;
      scoreDetail = actionTrackerSummary(parsed.items, today) as unknown as Prisma.InputJsonValue;
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
