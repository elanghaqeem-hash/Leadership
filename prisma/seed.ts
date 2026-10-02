import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
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


function rowsAfterSectionHeading(needle: string, headerFirstCell: string) {
  const rows = seed.gameCardsRaw?.rows as unknown[][];
  const heading = rows.findIndex((row) => String(row?.[0] ?? '').includes(needle));
  if (heading < 0) throw new Error(`Game cards section not found: ${needle}`);
  let i = heading + 1;
  while (i < rows.length && String(rows[i]?.[0] ?? '').toLowerCase() !== headerFirstCell.toLowerCase()) i += 1;
  i += 1;
  const out: unknown[][] = [];
  while (i < rows.length && rows[i]?.[0] != null && String(rows[i][0]).trim() !== '') {
    out.push(rows[i]);
    i += 1;
  }
  return out;
}

function rowsAfterGameHeading(needle: string) {
  return rowsAfterSectionHeading(needle, 'No');
}

function splitLabeledOptions(text: string) {
  return Object.fromEntries(
    text.split(' · ').map((part) => {
      const m = part.match(/^([A-E]):\s*(.*)$/);
      return m ? [m[1], m[2]] : [part, part];
    }),
  );
}

function structuredGameContent() {
  const mirrorRows = rowsAfterGameHeading('Game 1 · Leadership Mirror');
  const mirrorCards = mirrorRows.map((r) => ({
    no: Number(r[0]),
    situation: String(r[1] ?? ''),
    options: {
      ...splitLabeledOptions(String(r[2] ?? '')),
      ...splitLabeledOptions(String(r[3] ?? '')),
      ...splitLabeledOptions(String(r[4] ?? '')),
    },
  }));

  const pokerRows = rowsAfterGameHeading('Game 3 · Priority Poker');
  const pokerCards = pokerRows.map((r) => {
    const twist = String(r[3] ?? '');
    const [twistPrompt, ...rest] = twist.split('→');
    return {
      no: Number(r[0]),
      prompt: String(r[1] ?? ''),
      baseAnswer: String(r[2] ?? ''),
      twistPrompt: twistPrompt.trim(),
      twistExpected: rest.join('→').trim() || twist.trim(),
    };
  });

  const calendarRows = rowsAfterSectionHeading('Game 4 · Calendar Tetris', 'Jenis');
  const calendarBase = calendarRows.filter((r) => !String(r[0] ?? '').startsWith('Disrupsi')).map((r,idx) => ({
    id:'C'+String(idx+1).padStart(2,'0'), kind:String(r[0] ?? ''), card:String(r[1] ?? ''),
  }));
  const calendarDisruptions = calendarRows.filter((r) => String(r[0] ?? '').startsWith('Disrupsi')).map((r,idx) => ({
    no:idx+1, label:String(r[0] ?? ''), event:String(r[1] ?? ''),
  }));

  const delegationRelayRows = rowsAfterSectionHeading('Game 5 · Delegation Relay', 'Bagian');
  const delegationRelay = Object.fromEntries(delegationRelayRows.map((r)=>[String(r[0]??''),String(r[1]??'')]));

  const factRows = rowsAfterGameHeading('Game 6 · Fact or Fiction');
  const factCards = factRows.map((r) => ({
    no: Number(r[0]),
    statement: String(r[1] ?? ''),
    answer: String(r[2] ?? ''),
    additionalData: String(r[3] ?? ''),
  }));

  const rootCauseRows = rowsAfterSectionHeading('Game 8 · Root Cause Race', 'Data');
  const rootCauseData = rootCauseRows.map((r,idx)=>({no:idx+1,dimension:String(r[0]??''),evidence:String(r[1]??'')}));

  const detectiveRows = rowsAfterGameHeading('Game 7 · Detective Room');
  const detectiveEvidence = detectiveRows.filter((r)=>Number.isFinite(Number(r[0]))).map((r)=>({
    no:Number(r[0]), topic:String(r[1]??''), evidence:String(r[2]??''), category:String(r[3]??''),
  }));
  const detectiveDiagnosisKey = String(detectiveRows.find((r)=>String(r[0]??'').startsWith('Kunci:'))?.[0]??'').replace(/^Kunci:\s*/,'').trim();

  const biasTrapRows = rowsAfterGameHeading('Game 9 · Bias Trap');
  const biasTrapCards = biasTrapRows.map((r)=>({
    no:Number(r[0]), prompt:String(r[1]??''), bias:String(r[2]??''), betterQuestion:String(r[3]??''),
  }));
  const biasTrapChoices = [...new Set(biasTrapCards.map((x)=>x.bias))];

  const boardRows = rowsAfterSectionHeading('Game 11 · 60-Second Boardroom', 'Kasus');
  const boardCases = boardRows.map((r,idx) => ({ no:idx+1, label:String(r[0] ?? ''), brief:String(r[1] ?? '') }));

  const warInitialRows = rowsAfterSectionHeading('War Room — kartu kondisi awal', 'No');
  const warInitial = warInitialRows.map((r) => ({ no:Number(r[0]), condition:String(r[1] ?? '') }));
  const warEventRows = rowsAfterSectionHeading('War Room — event card', 'Event');
  const warEvents = warEventRows.map((r) => ({
    no:Number(r[0]),
    event:String(r[1] ?? ''),
    observerFocus:String(r[2] ?? ''),
  }));

  return { mirrorCards, pokerCards, calendarBase, calendarDisruptions, delegationRelay, factCards, rootCauseData, detectiveEvidence, detectiveDiagnosisKey, biasTrapCards, biasTrapChoices, boardCases, warInitial, warEvents };
}

async function main() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (email && password) {
    if (password.length < 12) throw new Error('BOOTSTRAP_ADMIN_PASSWORD minimal 12 karakter');
    const salt = crypto.randomBytes(16);
    const derived = crypto.pbkdf2Sync(password, salt, 600_000, 32, 'sha256');
    const passwordHash = ['pbkdf2-sha256', '600000', salt.toString('base64url'), derived.toString('base64url')].join(String.fromCharCode(36));
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

  const gameContent = structuredGameContent();
  const content = [] as Awaited<ReturnType<typeof upsertGlobalContent>>[];
  content.push(await upsertGlobalContent({code:'PROGRAM_BLUEPRINT_V1',type:'PROGRAM_BLUEPRINT',title:blueprint.title,payload:blueprint}));
  content.push(await upsertGlobalContent({code:'SELF_DIAGNOSTIC_V1',type:'SELF_DIAGNOSTIC',title:'Self-Diagnostic',payload:seed.selfDiagnostic}));
  content.push(await upsertGlobalContent({code:'PRIORITY_SCORECARD_V1',type:'TOOL_CONFIG',title:'Priority Scorecard',payload:seed.priorityScorecard}));
  content.push(await upsertGlobalContent({code:'WEEKLY_PLANNER_V1',type:'TOOL_CONFIG',title:'Weekly Planner',payload:seed.weeklyPlanner}));
  content.push(await upsertGlobalContent({
    code:'ARENA_EVENTS_V1',
    type:'LIVE_GAME',
    title:'Banking Leadership Arena',
    payload:{events:seed.arena.events.map((x:any)=>({no:x.no,event:x.event,dimension:x.dimension,doMinutes:x.doMinutes}))},
    answerKey:{events:seed.arena.events.map((x:any)=>({no:x.no,best:x.best,acceptable:x.acceptable}))},
  }));
  content.push(await upsertGlobalContent({
    code:'DECISION_AUCTION_V1',
    type:'TEAM_SIMULATION',
    title:'Decision Auction',
    payload:{
      budget:seed.decisionAuction.budget,
      switchingRate:seed.decisionAuction.switchingRate,
      maxActive:seed.decisionAuction.maxActive,
      programs:seed.decisionAuction.programs.map((p:any)=>({
        id:p.id,name:p.name,cost:p.cost,benefit:p.benefit,risk:p.risk,uncertainty:p.uncertainty,
      })),
    },
    answerKey:{
      roundInfo:seed.decisionAuction.roundInfo,
      factors:Object.fromEntries(seed.decisionAuction.programs.map((p:any)=>[p.id,p.factors])),
    },
  }));
  content.push(await upsertGlobalContent({code:'GAME_CARDS_EXCEL_V1',type:'GAME_CARDS_RAW',title:'Kartu Game dari Excel',payload:seed.gameCardsRaw}));
  content.push(await upsertGlobalContent({
    code:'LEADERSHIP_MIRROR_V1',
    type:'LIVE_GAME',
    title:'Leadership Mirror',
    payload:{cards:gameContent.mirrorCards},
  }));
  content.push(await upsertGlobalContent({
    code:'PRIORITY_POKER_V1',
    type:'LIVE_GAME',
    title:'Priority Poker',
    payload:{cards:gameContent.pokerCards.map(({baseAnswer,twistPrompt,twistExpected,...card})=>card)},
    answerKey:{cards:gameContent.pokerCards.map(({no,baseAnswer,twistPrompt,twistExpected})=>({no,baseAnswer,twistPrompt,twistExpected}))},
  }));
  content.push(await upsertGlobalContent({
    code:'CALENDAR_TETRIS_V1',
    type:'TEAM_SIMULATION',
    title:'Calendar Tetris',
    payload:{cards:gameContent.calendarBase},
    answerKey:{disruptions:gameContent.calendarDisruptions},
  }));
  content.push(await upsertGlobalContent({
    code:'DELEGATION_RELAY_V1',
    type:'TEAM_SIMULATION',
    title:'Delegation Relay',
    payload:{
      task:gameContent.delegationRelay['Tugas']||'',
      rule:gameContent.delegationRelay['Aturan']||'',
      observerChecklist:gameContent.delegationRelay['Observer cek']||'',
      timerSec:1200,
    },
  }));
  content.push(await upsertGlobalContent({
    code:'FACT_OR_FICTION_V1',
    type:'LIVE_GAME',
    title:'Fact or Fiction',
    payload:{cards:gameContent.factCards.map(({answer,additionalData,...card})=>card)},
    answerKey:{cards:gameContent.factCards.map(({no,answer,additionalData})=>({no,answer,additionalData}))},
  }));
  content.push(await upsertGlobalContent({
    code:'ROOT_CAUSE_RACE_V1',
    type:'TEAM_SIMULATION',
    title:'Root Cause Race',
    payload:{
      caseTitle:'Complaint naik 40%',
      evidence:gameContent.rootCauseData,
      framework:{fiveWhys:5,fishboneCategories:['People','Process','Policy','System','Data','Environment'],issueTree:'MECE'},
    },
  }));
  content.push(await upsertGlobalContent({
    code:'DETECTIVE_ROOM_V1',
    type:'TEAM_SIMULATION',
    title:'Detective Room',
    payload:{cards:gameContent.detectiveEvidence.map(({evidence,category,...card})=>card)},
    answerKey:{
      cards:gameContent.detectiveEvidence.map(({no,evidence,category})=>({no,evidence,category})),
      diagnosisKey:gameContent.detectiveDiagnosisKey,
      scoring:{diagnosisCorrect:40,relevantEvidence:5,remainingToken:2},
    },
  }));
  content.push(await upsertGlobalContent({
    code:'BIAS_TRAP_V1',
    type:'LIVE_GAME',
    title:'Bias Trap',
    payload:{cards:gameContent.biasTrapCards.map(({bias,betterQuestion,...card})=>card),choices:gameContent.biasTrapChoices},
    answerKey:{cards:gameContent.biasTrapCards.map(({no,bias,betterQuestion})=>({no,bias,betterQuestion}))},
  }));
  content.push(await upsertGlobalContent({
    code:'BOARDROOM_CASES_V1',
    type:'LIVE_GAME',
    title:'60-Second Boardroom Cases',
    payload:{cases:gameContent.boardCases,timerSec:60},
  }));
  content.push(await upsertGlobalContent({
    code:'WAR_ROOM_SCENARIO_V1',
    type:'TEAM_SIMULATION',
    title:'Leadership War Room',
    payload:{
      initialConditions:gameContent.warInitial,
      events:gameContent.warEvents.map(({observerFocus,...event})=>event),
      boardColumns:['Priority','Decision','Delegation','Escalation','Communication','Action'],
    },
    answerKey:{events:gameContent.warEvents.map(({no,observerFocus})=>({no,observerFocus}))},
  }));
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
  const delegationDimensions = [
    {code:'what',name:'What',max:1},
    {code:'why',name:'Why',max:1},
    {code:'expected_outcome',name:'Expected Outcome',max:1},
    {code:'authority',name:'Authority',max:1},
    {code:'boundary',name:'Boundary',max:1},
    {code:'deadline',name:'Deadline',max:1},
    {code:'checkpoint',name:'Checkpoint',max:1},
    {code:'evidence',name:'Evidence',max:1},
  ];
  const delegationRubricExisting = await prisma.rubric.findFirst({where:{tenantId:null,code:'DELEGATION_RELAY',version:1}});
  if (delegationRubricExisting) {
    await prisma.rubric.update({where:{id:delegationRubricExisting.id},data:{name:'Delegation Relay Checklist',dimensions:delegationDimensions,isPublished:true}});
  } else {
    await prisma.rubric.create({data:{tenantId:null,code:'DELEGATION_RELAY',name:'Delegation Relay Checklist',version:1,dimensions:delegationDimensions,isPublished:true}});
  }

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
