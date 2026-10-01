import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const root = path.resolve(process.cwd());
const seedPath = path.join(root, 'packages', 'content', 'seed', 'toolkit.seed.json');
const seed = JSON.parse(await fs.readFile(seedPath, 'utf8'));
const blueprint = JSON.parse(await fs.readFile(path.join(root, 'packages', 'content', 'seed', 'program.blueprint.json'), 'utf8'));

const stableHash = (value: unknown) => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');

async function upsertGlobalContent(input: {code:string;type:string;title:string;payload:unknown;answerKey?:unknown}) {
  const existing = await prisma.contentItem.findFirst({ where:{ tenantId:null, code:input.code, version:1 } });
  if (existing) return prisma.contentItem.update({ where:{id:existing.id}, data:{type:input.type,title:input.title,payload:input.payload as any,answerKey:input.answerKey as any,isPublished:true} });
  return prisma.contentItem.create({ data:{tenantId:null,code:input.code,version:1,type:input.type,title:input.title,payload:input.payload as any,answerKey:input.answerKey as any,isPublished:true} });
}

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD minimal 12 karakter');
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await prisma.user.upsert({
      where:{email},
      create:{email,name:process.env.BOOTSTRAP_ADMIN_NAME||'Platform Administrator',platformRole:'SUPER_ADMIN',passwordHash,emailVerifiedAt:new Date()},
      update:{platformRole:'SUPER_ADMIN',passwordHash,isActive:true},
    });
  }

  let program = await prisma.program.findFirst({ where:{tenantId:null,code:'LTW',isTemplate:true} });
  if (!program) program = await prisma.program.create({data:{tenantId:null,code:'LTW',name:'Leadership That Works',isTemplate:true}});

  let version = await prisma.programVersion.findFirst({where:{programId:program.id,version:1}});
  if (!version) version = await prisma.programVersion.create({data:{programId:program.id,version:1,status:'PUBLISHED',contentHash:seed.meta.sha256,publishedAt:new Date()}});
  else version = await prisma.programVersion.update({where:{id:version.id},data:{status:'PUBLISHED',contentHash:seed.meta.sha256,publishedAt:version.publishedAt??new Date()}});

  const scoringConfig = {
    source: seed.meta,
    priorityScorecard: seed.priorityScorecard,
    weeklyPlanner: seed.weeklyPlanner,
    arena: { decisionMinutes:seed.arena.decisionMinutes, scoring:seed.arena.scoring },
    decisionAuction: { budget:seed.decisionAuction.budget, switchingRate:seed.decisionAuction.switchingRate, maxActive:seed.decisionAuction.maxActive, programs:seed.decisionAuction.programs },
    warRoom: seed.warRoom,
    boardroom: seed.boardroom,
    test: { pointsPerQuestion:seed.test.pointsPerQuestion },
    managerFollowUp: seed.managerFollowUp,
    impactMetrics: seed.impactMetrics,
  };
  await prisma.programScoringConfig.upsert({
    where:{programVersionId:version.id},
    create:{programVersionId:version.id,schemaVersion:1,config:scoringConfig,configHash:stableHash(scoringConfig)},
    update:{schemaVersion:1,config:scoringConfig,configHash:stableHash(scoringConfig)},
  });

  const content = [] as Awaited<ReturnType<typeof upsertGlobalContent>>[];
  content.push(await upsertGlobalContent({code:'PROGRAM_BLUEPRINT_V1',type:'PROGRAM_BLUEPRINT',title:blueprint.title,payload:blueprint}));
  content.push(await upsertGlobalContent({code:'SELF_DIAGNOSTIC_V1',type:'SELF_DIAGNOSTIC',title:'Self-Diagnostic',payload:seed.selfDiagnostic}));
  content.push(await upsertGlobalContent({code:'PRIORITY_SCORECARD_V1',type:'TOOL_CONFIG',title:'Priority Scorecard',payload:seed.priorityScorecard}));
  content.push(await upsertGlobalContent({code:'WEEKLY_PLANNER_V1',type:'TOOL_CONFIG',title:'Weekly Planner',payload:seed.weeklyPlanner}));
  content.push(await upsertGlobalContent({code:'ARENA_EVENTS_V1',type:'GAME_CARDS',title:'Banking Leadership Arena',payload:{events:seed.arena.events},answerKey:{events:seed.arena.events.map((x:any)=>({no:x.no,best:x.best,acceptable:x.acceptable}))}}));
  content.push(await upsertGlobalContent({code:'DECISION_AUCTION_V1',type:'GAME_CARDS',title:'Decision Auction',payload:seed.decisionAuction}));
  content.push(await upsertGlobalContent({code:'GAME_CARDS_EXCEL_V1',type:'GAME_CARDS_RAW',title:'Kartu Game dari Excel',payload:seed.gameCardsRaw}));
  content.push(await upsertGlobalContent({code:'MANAGER_FOLLOWUP_V1',type:'FOLLOW_UP_CONFIG',title:'Manager Follow-up',payload:seed.managerFollowUp}));
  content.push(await upsertGlobalContent({code:'IMPACT_METRICS_V1',type:'IMPACT_CONFIG',title:'Impact Metrics',payload:seed.impactMetrics}));
  content.push(await upsertGlobalContent({code:'EVALUATION_L1_V1',type:'EVALUATION',title:'Evaluasi Training L1',payload:seed.evaluationL1}));

  for (let i=0;i<content.length;i++) {
    await prisma.programContentLink.upsert({
      where:{programVersionId_contentItemId:{programVersionId:version.id,contentItemId:content[i].id}},
      create:{programVersionId:version.id,contentItemId:content[i].id,sequence:i+1},
      update:{sequence:i+1},
    });
  }

  let warRubric = await prisma.rubric.findFirst({where:{tenantId:null,code:'WAR_ROOM',version:1}});
  warRubric = warRubric
    ? await prisma.rubric.update({where:{id:warRubric.id},data:{name:'War Room Score',dimensions:seed.warRoom.dimensions,isPublished:true}})
    : await prisma.rubric.create({data:{tenantId:null,code:'WAR_ROOM',name:'War Room Score',version:1,dimensions:seed.warRoom.dimensions,isPublished:true}});
  let boardRubric = await prisma.rubric.findFirst({where:{tenantId:null,code:'BOARDROOM',version:1}});
  boardRubric = boardRubric
    ? await prisma.rubric.update({where:{id:boardRubric.id},data:{name:'60-Second Boardroom',dimensions:seed.boardroom,isPublished:true}})
    : await prisma.rubric.create({data:{tenantId:null,code:'BOARDROOM',name:'60-Second Boardroom',version:1,dimensions:seed.boardroom,isPublished:true}});

  let test = await prisma.test.findFirst({where:{tenantId:null,code:'LTW_PRE_POST',version:1}});
  test = test
    ? await prisma.test.update({where:{id:test.id},data:{name:'Leadership That Works Pre/Post Test',durationSec:1200}})
    : await prisma.test.create({data:{tenantId:null,code:'LTW_PRE_POST',name:'Leadership That Works Pre/Post Test',version:1,durationSec:1200}});
  for (const q of seed.test.questions) {
    await prisma.question.upsert({
      where:{testId_code:{testId:test.id,code:`Q${String(q.no).padStart(2,'0')}`}},
      create:{testId:test.id,code:`Q${String(q.no).padStart(2,'0')}`,prompt:q.question,options:q.options,answerKey:q.answer,points:seed.test.pointsPerQuestion,sequence:q.no},
      update:{prompt:q.question,options:q.options,answerKey:q.answer,points:seed.test.pointsPerQuestion,sequence:q.no},
    });
  }

  console.log(JSON.stringify({program:program.id,version:version.id,contentItems:content.length,questions:seed.test.questions.length,sourceHash:seed.meta.sha256},null,2));
}

main().finally(async()=>prisma.$disconnect());
