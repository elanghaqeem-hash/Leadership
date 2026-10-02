import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const base = process.env.APP_URL || 'http://127.0.0.1:3000';
const participantCount = 30;
const thresholdMs = Number(process.env.CLASSROOM_P95_THRESHOLD_MS || 1000);

const suffix = crypto.randomUUID().slice(0, 8);
const userIds = [];
let tenantId;

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const percentile = (values, p) => {
  const sorted = [...values].sort((a,b)=>a-b);
  const index = Math.max(0, Math.ceil(sorted.length * p) - 1);
  return sorted[index];
};

try {
  const version = await prisma.programVersion.findFirst({
    where: { program: { code: 'LTW', isTemplate: true }, status: 'PUBLISHED' },
    orderBy: { version: 'desc' },
  });
  if (!version) throw new Error('Published LTW program version is required');

  const tenant = await prisma.tenant.create({
    data: { name: 'CI Classroom Load '+suffix, slug: 'ci-load-'+suffix },
  });
  tenantId = tenant.id;

  const batch = await prisma.batch.create({
    data: {
      tenantId: tenant.id,
      programVersionId: version.id,
      code: 'LOAD-'+suffix,
      name: 'CI Classroom 30 Participant Load',
      joinCode: String(100000 + Math.floor(Math.random()*900000)),
      startDate: new Date(),
      endDate: new Date(Date.now()+24*60*60*1000),
      status: 'ACTIVE',
      teamCount: 4,
      participantTarget: participantCount,
    },
  });

  const teams = [];
  for (let i=1;i<=4;i++) {
    teams.push(await prisma.team.create({
      data: { tenantId: tenant.id, batchId: batch.id, name: 'Team '+i, number: i },
    }));
  }

  const activity = await prisma.activity.create({
    data: {
      tenantId: tenant.id,
      batchId: batch.id,
      type: 'LEADERSHIP_MIRROR',
      title: 'CI Leadership Mirror Load Test',
      sequence: 1,
      status: 'OPEN',
      config: { gameContentCode: 'LEADERSHIP_MIRROR_V1' },
      openedAt: new Date(),
    },
  });

  await prisma.gameRound.create({
    data: {
      batchId: batch.id,
      activityId: activity.id,
      roundNo: 1,
      state: {
        gameType: 'LEADERSHIP_MIRROR',
        cardNo: 1,
        stage: 'BASE',
        phase: 'VOTING',
        startedAt: new Date().toISOString(),
      },
      openedAt: new Date(),
    },
  });

  const clients = [];
  for (let i=0;i<participantCount;i++) {
    const user = await prisma.user.create({
      data: {
        email: `ci-load-${suffix}-${i}@example.local`,
        name: 'CI Participant '+(i+1),
        isActive: true,
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(user.id);
    await prisma.batchMembership.create({
      data: {
        batchId: batch.id,
        userId: user.id,
        role: 'PARTICIPANT',
        teamId: teams[i % teams.length].id,
      },
    });
    const token = crypto.randomBytes(32).toString('base64url');
    await prisma.authSession.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now()+60*60*1000),
      },
    });
    clients.push({
      cookie: `${process.env.SESSION_COOKIE_NAME || 'ltw_session'}=${token}`,
      choice: ['A','B','C','D','E'][i % 5],
    });
  }

  // Warm application and database connection pools before measuring concurrent voting.
  const warm = await fetch(base+'/api/health');
  if (!warm.ok) throw new Error('Application health check failed before load test');

  const results = await Promise.all(clients.map(async (client) => {
    const started = performance.now();
    const response = await fetch(base+'/api/games/'+activity.id+'/live', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: client.cookie,
      },
      body: JSON.stringify({ choice: client.choice }),
    });
    const elapsed = performance.now()-started;
    const body = await response.text();
    return { status: response.status, elapsed, body };
  }));

  const failures = results.filter(x=>x.status!==200);
  if (failures.length) {
    throw new Error(`Concurrent classroom vote failed for ${failures.length}/${participantCount}: ${failures[0]?.status} ${failures[0]?.body}`);
  }

  const latencies = results.map(x=>x.elapsed);
  const p50 = percentile(latencies,0.50);
  const p95 = percentile(latencies,0.95);
  const max = Math.max(...latencies);
  const count = await prisma.submission.count({
    where: { activityId: activity.id, submissionKey: { startsWith: 'game:'+activity.id+':1:BASE:' } },
  });
  if (count !== participantCount) throw new Error(`Expected ${participantCount} votes, found ${count}`);
  if (p95 >= thresholdMs) {
    throw new Error(`Classroom p95 latency ${p95.toFixed(1)}ms exceeds threshold ${thresholdMs}ms`);
  }

  console.log(JSON.stringify({
    ok: true,
    participants: participantCount,
    successfulVotes: count,
    p50Ms: Number(p50.toFixed(1)),
    p95Ms: Number(p95.toFixed(1)),
    maxMs: Number(max.toFixed(1)),
    thresholdMs,
  }, null, 2));
} finally {
  if (tenantId) await prisma.tenant.delete({ where: { id: tenantId } }).catch(()=>undefined);
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(()=>undefined);
  await prisma.$disconnect();
}
