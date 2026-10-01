import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const program = await prisma.program.findFirst({
    where: { tenantId: null, code: 'LTW', isTemplate: true },
    include: { versions: { include: { scoringConfig: true }, orderBy: { version: 'desc' }, take: 1 } },
  });
  if (!program) throw new Error('LTW template program not seeded');
  const version = program.versions[0];
  if (!version || version.status !== 'PUBLISHED' || !version.scoringConfig) {
    throw new Error('Published program version/scoring config missing');
  }

  const test = await prisma.test.findFirst({ where: { tenantId: null, code: 'LTW_PRE_POST', version: 1 } });
  if (!test) throw new Error('Pre/Post test not seeded');
  const questionCount = await prisma.question.count({ where: { testId: test.id } });
  if (questionCount !== 20) throw new Error(`Expected 20 questions, found ${questionCount}`);

  const contentCount = await prisma.contentItem.count({ where: { tenantId: null, isPublished: true } });
  if (contentCount < 8) throw new Error(`Expected at least 8 published content items, found ${contentCount}`);

  const liveGames = await prisma.contentItem.findMany({
    where: { tenantId: null, code: { in: ['LEADERSHIP_MIRROR_V1','PRIORITY_POKER_V1','FACT_OR_FICTION_V1','BIAS_TRAP_V1'] }, version: 1 },
    select: { code: true, payload: true, answerKey: true },
  });
  if (liveGames.length !== 4) throw new Error(`Expected 4 structured live-game content items, found ${liveGames.length}`);
  const byCode = new Map(liveGames.map((item) => [item.code, item]));
  const mirrorCards = byCode.get('LEADERSHIP_MIRROR_V1')?.payload?.cards;
  const pokerCards = byCode.get('PRIORITY_POKER_V1')?.payload?.cards;
  const factCards = byCode.get('FACT_OR_FICTION_V1')?.payload?.cards;
  if (!Array.isArray(mirrorCards) || mirrorCards.length !== 10) throw new Error('Leadership Mirror must have 10 Excel-derived cards');
  if (!Array.isArray(pokerCards) || pokerCards.length !== 8) throw new Error('Priority Poker must have 8 Excel-derived cards');
  if (!Array.isArray(factCards) || factCards.length !== 6) throw new Error('Fact or Fiction must have 6 Excel-derived cards');
  if (pokerCards.some((card) => 'baseAnswer' in card || 'twistExpected' in card)) throw new Error('Priority Poker answer key leaked into public payload');
  const pokerKey = byCode.get('PRIORITY_POKER_V1')?.answerKey?.cards;
  if (!Array.isArray(pokerKey) || pokerKey.length !== 8) throw new Error('Priority Poker answer key is missing');

  const biasPayload = byCode.get('BIAS_TRAP_V1')?.payload;
  const biasCards = biasPayload?.cards;
  if (!Array.isArray(biasCards) || biasCards.length !== 6) throw new Error('Bias Trap must have 6 Excel-derived cards');
  if (biasCards.some((card) => 'bias' in card || 'betterQuestion' in card)) throw new Error('Bias Trap answer key leaked into public payload');
  if (!Array.isArray(biasPayload?.choices) || biasPayload.choices.length < 4) throw new Error('Bias Trap choices are missing');

  const advancedContent = await prisma.contentItem.findMany({
    where: { tenantId: null, code: { in: ['ARENA_EVENTS_V1','WAR_ROOM_SCENARIO_V1','DECISION_AUCTION_V1','BOARDROOM_CASES_V1','CALENDAR_TETRIS_V1','DETECTIVE_ROOM_V1'] }, version: 1 },
    select: { code: true, payload: true, answerKey: true },
  });
  if (advancedContent.length !== 6) throw new Error(`Expected 6 advanced game content items, found ${advancedContent.length}`);
  const advancedByCode = new Map(advancedContent.map((item) => [item.code, item]));

  const arenaPayload = advancedByCode.get('ARENA_EVENTS_V1')?.payload;
  const arenaEvents = arenaPayload?.events;
  if (!Array.isArray(arenaEvents) || arenaEvents.length !== 20) throw new Error('Arena must have 20 Excel-derived events');
  if (arenaEvents.some((event) => 'best' in event || 'acceptable' in event)) throw new Error('Arena answer key leaked into public payload');

  const warPayload = advancedByCode.get('WAR_ROOM_SCENARIO_V1')?.payload;
  if (!Array.isArray(warPayload?.initialConditions) || warPayload.initialConditions.length !== 10) throw new Error('War Room must have 10 initial conditions');
  if (!Array.isArray(warPayload?.events) || warPayload.events.length !== 7) throw new Error('War Room must have 7 events');
  if (warPayload.events.some((event) => 'observerFocus' in event)) throw new Error('War Room observer key leaked into public payload');

  const auctionPayload = advancedByCode.get('DECISION_AUCTION_V1')?.payload;
  if (!Array.isArray(auctionPayload?.programs) || auctionPayload.programs.length !== 7) throw new Error('Decision Auction must have 7 programs');
  if ('roundInfo' in auctionPayload || auctionPayload.programs.some((program) => 'factors' in program)) throw new Error('Decision Auction future information leaked into public payload');

  const boardPayload = advancedByCode.get('BOARDROOM_CASES_V1')?.payload;
  if (!Array.isArray(boardPayload?.cases) || boardPayload.cases.length !== 3) throw new Error('Boardroom must have 3 Excel-derived cases');
  if (boardPayload.timerSec !== 60) throw new Error('Boardroom timer must be 60 seconds');

  const calendarPayload = advancedByCode.get('CALENDAR_TETRIS_V1')?.payload;
  const calendarKey = advancedByCode.get('CALENDAR_TETRIS_V1')?.answerKey;
  if (!Array.isArray(calendarPayload?.cards) || calendarPayload.cards.length !== 8) throw new Error('Calendar Tetris must have 8 base cards');
  if ('disruptions' in calendarPayload) throw new Error('Calendar Tetris disruptions leaked into public payload');
  if (!Array.isArray(calendarKey?.disruptions) || calendarKey.disruptions.length !== 4) throw new Error('Calendar Tetris must have 4 hidden disruption cards');

  const detectivePayload = advancedByCode.get('DETECTIVE_ROOM_V1')?.payload;
  const detectiveKey = advancedByCode.get('DETECTIVE_ROOM_V1')?.answerKey;
  if (!Array.isArray(detectivePayload?.cards) || detectivePayload.cards.length !== 12) throw new Error('Detective Room must have 12 evidence topics');
  if (detectivePayload.cards.some((card) => 'evidence' in card || 'category' in card)) throw new Error('Detective Room evidence leaked before purchase');
  if (!Array.isArray(detectiveKey?.cards) || detectiveKey.cards.length !== 12 || !detectiveKey?.diagnosisKey) throw new Error('Detective Room hidden key is incomplete');

  const delegationRubric = await prisma.rubric.findFirst({ where: { tenantId: null, code: 'DELEGATION_RELAY', version: 1 } });
  const delegationDimensions = delegationRubric?.dimensions;
  if (!Array.isArray(delegationDimensions) || delegationDimensions.length !== 8) throw new Error('Delegation Relay rubric must have 8 elements');

  console.log(JSON.stringify({
    ok: true,
    programId: program.id,
    version: version.version,
    contentHash: version.contentHash,
    contentCount,
    questionCount,
    liveGameContent: liveGames.map((x) => x.code),
    delegationRubricDimensions: delegationDimensions.length,
    advancedContent: advancedContent.map((x) => x.code),
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
