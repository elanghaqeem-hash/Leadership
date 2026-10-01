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

  const adminEmail = process.env.BOOTSTRAP_ADMIN_EMAIL?.toLowerCase();
  const admin = adminEmail ? await prisma.user.findUnique({ where: { email: adminEmail } }) : null;
  if (!admin || admin.platformRole !== 'SUPER_ADMIN') throw new Error('Bootstrap Super Admin missing');

  console.log(JSON.stringify({
    ok: true,
    programId: program.id,
    version: version.version,
    contentHash: version.contentHash,
    contentCount,
    questionCount,
    bootstrapAdmin: admin.email,
  }, null, 2));
} finally {
  await prisma.$disconnect();
}
