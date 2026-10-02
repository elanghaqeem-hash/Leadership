import { NextResponse } from 'next/server';
import { Prisma, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { prisma, withRequestPrisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { can } from '@ltw/authz';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const voteSchema = z.object({ choice: z.string().trim().min(1).max(40) });
const controlSchema = z.object({
  command: z.enum(['START','TWIST','REVEAL','CLOSE']),
  cardNo: z.number().int().positive().optional(),
});

type RoundState = {
  gameType: string;
  cardNo: number;
  stage: 'BASE' | 'TWIST';
  phase: 'VOTING' | 'REVEALED' | 'CLOSED';
  startedAt: string;
};

const supported = new Set(['LEADERSHIP_MIRROR','PRIORITY_POKER','FACT_OR_FICTION','BIAS_TRAP']);

function allowedChoices(type: string, content?: { payload: Prisma.JsonValue }) {
  if (type === 'LEADERSHIP_MIRROR') return ['A','B','C','D','E'];
  if (type === 'PRIORITY_POKER') return ['P1','P2','P3','P4'];
  if (type === 'FACT_OR_FICTION') return ['FACT','ASSUMPTION','OPINION','UNKNOWN'];
  if (type === 'BIAS_TRAP') {
    const payload = content?.payload as { choices?: unknown } | undefined;
    return Array.isArray(payload?.choices) ? payload!.choices.map(String) : [];
  }
  return [];
}

async function loadGame(activityId: string, db: PrismaClient = prisma) {
  const activity = await db.activity.findUnique({
    where: { id: activityId },
    select: {
      id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true,
      batch:{select:{id:true,code:true,name:true}},
    },
  });
  if (!activity || !supported.has(activity.type)) throw new HttpError('Live game tidak ditemukan', 404);
  const cfg = activity.config as { gameContentCode?: unknown };
  const code = typeof cfg?.gameContentCode === 'string' ? cfg.gameContentCode : null;
  if (!code) throw new HttpError('Konten live game belum dikonfigurasi', 409);
  const content = await db.contentItem.findFirst({
    where: { code, isPublished:true, OR:[{tenantId:null},{tenantId:activity.tenantId}] },
    orderBy: { version:'desc' },
    select: { code:true,title:true,payload:true,answerKey:true,version:true },
  });
  if (!content) throw new HttpError('Konten game tidak ditemukan', 404);
  return { activity, content };
}

function cardsFrom(content: { payload: Prisma.JsonValue }) {
  const payload = content.payload as { cards?: unknown };
  if (!Array.isArray(payload?.cards)) throw new HttpError('Format konten game tidak valid', 500);
  return payload.cards as Array<Record<string, unknown>>;
}

function keyCardsFrom(content: { answerKey: Prisma.JsonValue | null }) {
  const answer = content.answerKey as { cards?: unknown } | null;
  return Array.isArray(answer?.cards) ? answer!.cards as Array<Record<string, unknown>> : [];
}

function stateOf(value: Prisma.JsonValue): RoundState {
  return value as unknown as RoundState;
}

async function aggregateVotes(activityId: string, roundNo: number, stage: string, db: PrismaClient = prisma) {
  const prefix = `game:${activityId}:${roundNo}:${stage}:`;
  const submissions = await db.submission.findMany({
    where: { activityId, submissionKey:{startsWith:prefix} },
    select: { payload:true },
  });
  const counts: Record<string, number> = {};
  for (const row of submissions) {
    const payload = row.payload as { choice?: unknown };
    if (typeof payload.choice === 'string') counts[payload.choice] = (counts[payload.choice] ?? 0) + 1;
  }
  return { totalVotes:submissions.length, counts };
}

export async function GET(_req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  try {
    const { activityId } = await params;
    const { activity, content } = await loadGame(activityId);
    const user = await assertPermission('BATCH_ACTIVITY_READ', { tenantId:activity.tenantId, batchId:activity.batchId });
    const membership = await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
      select:{role:true,teamId:true,isActive:true},
    });
    const isTrainer = user.platformRole === 'SUPER_ADMIN' || membership?.role === 'LEAD_TRAINER';

    const round = await prisma.gameRound.findFirst({
      where:{activityId,teamId:null},
      orderBy:{roundNo:'desc'},
    });
    if (!round) {
      return NextResponse.json({
        activity:{id:activity.id,type:activity.type,title:activity.title,status:activity.status},
        content:{code:content.code,title:content.title,version:content.version},
        round:null,
        choices:allowedChoices(activity.type, content),
      });
    }

    const state = stateOf(round.state);
    const cards = cardsFrom(content);
    const card = cards.find((x) => Number(x.no) === state.cardNo) ?? null;
    const keyCard = keyCardsFrom(content).find((x) => Number(x.no) === state.cardNo) ?? null;
    const revealed = state.phase === 'REVEALED' || state.phase === 'CLOSED';
    const publicCard:Record<string, unknown> = { ...(card ?? {}) };

    if (activity.type === 'PRIORITY_POKER' && state.stage === 'TWIST' && keyCard) {
      publicCard.twistPrompt = keyCard.twistPrompt;
    }
    if (activity.type === 'FACT_OR_FICTION' && revealed && keyCard) {
      publicCard.additionalData = keyCard.additionalData;
    }

    const voteKey = `game:${activityId}:${round.roundNo}:${state.stage}:${user.id}`;
    const myVote = membership?.role === 'PARTICIPANT'
      ? await prisma.submission.findUnique({where:{submissionKey:voteKey},select:{payload:true,submittedAt:true}})
      : null;
    const aggregate = await aggregateVotes(activityId, round.roundNo, state.stage);

    let answer:unknown = null;
    if ((revealed || isTrainer) && keyCard) {
      answer = activity.type === 'PRIORITY_POKER'
        ? state.stage === 'TWIST'
          ? { expected:keyCard.twistExpected }
          : { expected:keyCard.baseAnswer }
        : activity.type === 'FACT_OR_FICTION'
          ? { expected:keyCard.answer, additionalData:keyCard.additionalData }
          : activity.type === 'BIAS_TRAP'
            ? { expected:keyCard.bias, betterQuestion:keyCard.betterQuestion }
            : null;
    }

    return NextResponse.json({
      activity:{id:activity.id,type:activity.type,title:activity.title,status:activity.status},
      content:{code:content.code,title:content.title,version:content.version},
      round:{id:round.id,roundNo:round.roundNo,...state,openedAt:round.openedAt,closedAt:round.closedAt},
      card:publicCard,
      choices:allowedChoices(activity.type, content),
      myVote:myVote ? (myVote.payload as {choice?:unknown}).choice ?? null : null,
      totalVotes:aggregate.totalVotes,
      aggregate:(revealed || isTrainer) ? aggregate.counts : null,
      answer,
      canControl:isTrainer,
    });
  } catch (e) {
    return jsonError(e);
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  return withRequestPrisma(async (db) => {
    try {
      const { activityId } = await params;
      const { choice } = voteSchema.parse(await req.json());

      const [activity, user] = await Promise.all([
        db.activity.findUnique({
          where: { id: activityId },
          select: {
            id: true,
            tenantId: true,
            batchId: true,
            type: true,
            status: true,
            config: true,
          },
        }),
        requireUser(db),
      ]);

      if (!activity || !supported.has(activity.type)) {
        throw new HttpError('Live game tidak ditemukan', 404);
      }
      if (activity.status !== 'OPEN') {
        throw new HttpError('Game belum dibuka atau sudah dikunci', 409);
      }

      const [membership, round] = await Promise.all([
        db.batchMembership.findUnique({
          where: { batchId_userId: { batchId: activity.batchId, userId: user.id } },
          select: { role: true, teamId: true, isActive: true },
        }),
        db.gameRound.findFirst({
          where: { activityId, teamId: null },
          orderBy: { roundNo: 'desc' },
        }),
      ]);

      if (!membership?.isActive || membership.role !== 'PARTICIPANT') {
        throw new HttpError('Hanya participant aktif yang dapat voting', 403);
      }
      if (!can('OWN_SUBMISSION_WRITE', {
        role: 'PARTICIPANT',
        actorTenantId: activity.tenantId,
        resourceTenantId: activity.tenantId,
        actorBatchId: activity.batchId,
        resourceBatchId: activity.batchId,
        isOwner: true,
      })) {
        throw new HttpError('Forbidden', 403);
      }
      if (!round) throw new HttpError('Round belum dimulai trainer', 409);

      const state = stateOf(round.state);
      if (state.phase !== 'VOTING') {
        throw new HttpError('Voting round sudah ditutup/reveal', 409);
      }

      let content: { payload: Prisma.JsonValue } | undefined;
      if (activity.type === 'BIAS_TRAP') {
        const cfg = activity.config as { gameContentCode?: unknown };
        const code = typeof cfg?.gameContentCode === 'string' ? cfg.gameContentCode : null;
        if (!code) throw new HttpError('Konten live game belum dikonfigurasi', 409);
        const row = await db.contentItem.findFirst({
          where: {
            code,
            isPublished: true,
            OR: [{ tenantId: null }, { tenantId: activity.tenantId }],
          },
          orderBy: { version: 'desc' },
          select: { payload: true },
        });
        if (!row) throw new HttpError('Konten game tidak ditemukan', 404);
        content = row;
      }

      const choices = allowedChoices(activity.type, content);
      const normalizedChoice = choices.find((item) => item.toLowerCase() === choice.toLowerCase());
      if (!normalizedChoice) throw new HttpError('Pilihan vote tidak valid', 400);

      const submissionKey = `game:${activityId}:${round.roundNo}:${state.stage}:${user.id}`;
      const payload = {
        game: true,
        roundNo: round.roundNo,
        stage: state.stage,
        choice: normalizedChoice,
      };

      await db.submission.upsert({
        where: { submissionKey },
        create: {
          tenantId: activity.tenantId,
          batchId: activity.batchId,
          activityId,
          ownerType: 'USER',
          userId: user.id,
          teamId: membership.teamId,
          submissionKey,
          payload: payload as Prisma.InputJsonValue,
          submittedAt: new Date(),
        },
        update: {
          payload: payload as Prisma.InputJsonValue,
          submittedAt: new Date(),
          version: { increment: 1 },
        },
      });

      publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
      return NextResponse.json({ ok: true, choice: normalizedChoice });
    } catch (e) {
      return jsonError(e);
    }
  }).catch((e) => jsonError(e));
}

export async function PATCH(req: Request, { params }: { params: Promise<{ activityId: string }> }) {
  try {
    const { activityId } = await params;
    const input = controlSchema.parse(await req.json());
    const { activity, content } = await loadGame(activityId);
    const actor = await assertPermission('GAME_CONFIGURE', { tenantId:activity.tenantId,batchId:activity.batchId });
    if (activity.status !== 'OPEN') throw new HttpError('Buka aktivitas terlebih dahulu dari Trainer Console', 409);

    const cards = cardsFrom(content);
    const latest = await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
    const latestState = latest ? stateOf(latest.state) : null;

    if (input.command === 'START') {
      if (latest && latestState?.phase !== 'CLOSED') throw new HttpError('Tutup round aktif sebelum memulai round baru', 409);
      const roundNo = (latest?.roundNo ?? 0) + 1;
      const previousCardNo = latestState?.cardNo ?? 0;
      const cardNo = input.cardNo ?? (previousCardNo >= cards.length ? 1 : previousCardNo + 1);
      if (!cards.some((x) => Number(x.no) === cardNo)) throw new HttpError('Nomor kartu tidak tersedia', 400);
      const state:RoundState={gameType:activity.type,cardNo,stage:'BASE',phase:'VOTING',startedAt:new Date().toISOString()};
      const round = await prisma.gameRound.create({
        data:{batchId:activity.batchId,activityId,teamId:null,roundNo,state:state as unknown as Prisma.InputJsonValue,openedAt:new Date()},
      });
      await prisma.auditLog.create({data:{
        actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'OPEN_ACTIVITY',
        resourceType:'GameRound',resourceId:round.id,metadata:{activityId,roundNo,cardNo,gameType:activity.type},
      }});
      publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round});
    }

    if (!latest || !latestState) throw new HttpError('Belum ada round aktif', 409);
    let nextState:RoundState={...latestState};
    let auditAction:'SEND_EVENT'|'REVEAL_KEY'|'UPDATE'='UPDATE';

    if (input.command === 'TWIST') {
      if (activity.type !== 'PRIORITY_POKER') throw new HttpError('Twist hanya tersedia untuk Priority Poker pada implementasi ini', 409);
      if (latestState.phase === 'CLOSED') throw new HttpError('Round sudah ditutup', 409);
      nextState={...latestState,stage:'TWIST',phase:'VOTING'};
      auditAction='SEND_EVENT';
    } else if (input.command === 'REVEAL') {
      if (latestState.phase === 'CLOSED') throw new HttpError('Round sudah ditutup', 409);
      nextState={...latestState,phase:'REVEALED'};
      auditAction='REVEAL_KEY';
    } else if (input.command === 'CLOSE') {
      nextState={...latestState,phase:'CLOSED'};
    }

    const updated = await prisma.gameRound.update({
      where:{id:latest.id},
      data:{state:nextState as unknown as Prisma.InputJsonValue,closedAt:input.command==='CLOSE'?new Date():null},
    });
    await prisma.auditLog.create({data:{
      actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:auditAction,
      resourceType:'GameRound',resourceId:latest.id,
      metadata:{activityId,roundNo:latest.roundNo,command:input.command,stage:nextState.stage,phase:nextState.phase},
    }});
    publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:updated});
  } catch (e) {
    return jsonError(e);
  }
}
