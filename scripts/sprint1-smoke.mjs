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
    where: { tenantId: null, code: { in: ['LEADERSHIP_MIRROR_V1','PRIORITY_POKER_V1','FACT_OR_FICTION_V1'] }, version: 1 },
    select: { code: true, payload: true, answerKey: true },
  });
  if (liveGames.length !== 3) throw new Error(`Expected 3 structured live-game content items, found ${liveGames.length}`);
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
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
