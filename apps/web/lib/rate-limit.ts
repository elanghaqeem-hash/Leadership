import { createHash } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@ltw/db';

export type RateLimitResult={
  allowed:boolean;
  limit:number;
  remaining:number;
  retryAfterSec:number;
  count:number;
  resetAt:Date;
};

function hashedKey(scope:string,identifier:string,windowStart:number){
  return createHash('sha256').update(scope+'|'+identifier+'|'+windowStart).digest('hex');
}

export function requestIp(req:Request){
  const forwarded=req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded||req.headers.get('x-real-ip')?.trim()||'unknown';
}

export async function consumeRateLimit(input:{
  scope:string;
  identifier:string;
  limit:number;
  windowMs:number;
  now?:number;
}, db: PrismaClient = prisma):Promise<RateLimitResult>{
  const now=input.now??Date.now();
  const windowStart=Math.floor(now/input.windowMs)*input.windowMs;
  const resetAt=new Date(windowStart+input.windowMs);
  const key=hashedKey(input.scope,input.identifier,windowStart);
  const rows=await db.$queryRaw<Array<{count:number}>>(Prisma.sql`
    INSERT INTO "RateLimitBucket" ("key","scope","windowStart","expiresAt","count","updatedAt")
    VALUES (
      ${key},
      ${input.scope},
      ${new Date(windowStart)},
      ${resetAt},
      1,
      NOW()
    )
    ON CONFLICT ("key") DO UPDATE SET
      "count" = "RateLimitBucket"."count" + 1,
      "updatedAt" = NOW()
    RETURNING "count"
  `);
  const count=rows[0]?.count??input.limit+1;
  const retryAfterSec=Math.max(1,Math.ceil((resetAt.getTime()-now)/1000));
  return{
    allowed:count<=input.limit,
    limit:input.limit,
    remaining:Math.max(0,input.limit-count),
    retryAfterSec,
    count,
    resetAt,
  };
}

export function rateLimitHeaders(result:RateLimitResult){
  return{
    'X-RateLimit-Limit':String(result.limit),
    'X-RateLimit-Remaining':String(result.remaining),
    'X-RateLimit-Reset':String(Math.ceil(result.resetAt.getTime()/1000)),
    ...(result.allowed?{}:{'Retry-After':String(result.retryAfterSec)}),
  };
}
