import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

const gameTypes=[
  'LEADERSHIP_MIRROR','PRIORITY_POKER','CALENDAR_TETRIS','DELEGATION_RELAY',
  'FACT_OR_FICTION','DETECTIVE_ROOM','ROOT_CAUSE_RACE','BIAS_TRAP',
  'DECISION_AUCTION','BOARDROOM','ARENA','WAR_ROOM',
];

function ratings(payload:unknown){
  const obj=(payload??{}) as {ratings?:unknown};
  if(!obj.ratings||typeof obj.ratings!=='object'||Array.isArray(obj.ratings))return null;
  return Object.fromEntries(Object.entries(obj.ratings as Record<string,unknown>).flatMap(([k,v])=>typeof v==='number'?[[k,v]]:[]));
}
function daysUntil(date:Date){
  const today=new Date();
  const a=Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),today.getUTCDate());
  const b=Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
  return Math.ceil((b-a)/86400000);
}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const user=await requireUser();
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},
      select:{id:true,tenantId:true,code:true,name:true,status:true,startDate:true,endDate:true},
    });
    if(!batch)throw new HttpError('Batch tidak ditemukan',404);
    await assertPermission('INDIVIDUAL_DASHBOARD_READ',{tenantId:batch.tenantId,batchId,resourceUserId:user.id});
    const membership=await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId,userId:user.id}},
      select:{role:true,isActive:true,teamId:true,team:{select:{name:true,number:true}}},
    });
    if(!membership?.isActive||membership.role!=='PARTICIPANT')throw new HttpError('Dashboard participant tidak tersedia',403);

    const diagnosticActivities=await prisma.activity.findMany({
      where:{batchId,type:'SELF_DIAGNOSTIC'},
      select:{id:true,config:true,title:true},
    });
    const diagnosticSubs=await prisma.submission.findMany({
      where:{batchId,userId:user.id,activityId:{in:diagnosticActivities.map(a=>a.id)}},
      select:{activityId:true,payload:true,score:true,submittedAt:true},
    });
    const diag=(mode:string)=>{
      const a=diagnosticActivities.find(x=>(x.config as any)?.mode===mode);
      const s=a?diagnosticSubs.find(x=>x.activityId===a.id):null;
      return s?{ratings:ratings(s.payload),score:s.score===null?null:Number(s.score),submittedAt:s.submittedAt}:null;
    };

    const test=await prisma.test.findFirst({where:{tenantId:null,code:'LTW_PRE_POST',version:1},select:{id:true}});
    const attempts=test?await prisma.testAttempt.findMany({
      where:{testId:test.id,batchId,userId:user.id},
      select:{kind:true,score:true,submittedAt:true},
    }):[];
    const pre=attempts.find(a=>a.kind==='PRE'&&a.submittedAt);
    const post=attempts.find(a=>a.kind==='POST'&&a.submittedAt);

    const activities=await prisma.activity.findMany({
      where:{batchId,type:{in:gameTypes as any}},
      select:{id:true,type:true,title:true,status:true},
      orderBy:{sequence:'asc'},
    });
    const gameSubs=await prisma.submission.findMany({
      where:{
        batchId,activityId:{in:activities.map(a=>a.id)},
        OR:[
          {userId:user.id},
          ...(membership.teamId?[{teamId:membership.teamId}]:[]),
        ],
      },
      select:{activityId:true,submittedAt:true},
    });
    const participated=new Set(gameSubs.map(s=>s.activityId));
    const badges=activities.filter(a=>participated.has(a.id)||['REVEALED','CLOSED'].includes(a.status)).map(a=>({
      activityId:a.id,type:a.type,title:a.title,
      earned:participated.has(a.id),
      status:a.status,
    }));

    const [plan,evaluation,individualSubmissions,individualActivityCount]=await Promise.all([
      prisma.thirtyDayPlan.findUnique({
        where:{batchId_participantUserId:{batchId,participantUserId:user.id}},
        include:{targets:{orderBy:{sequence:'asc'}},followUps:{orderBy:{kind:'asc'}}},
      }),
      prisma.evaluationL1.findUnique({
        where:{batchId_participantUserId:{batchId,participantUserId:user.id}},
        select:{averageScore:true,submittedAt:true},
      }),
      prisma.submission.findMany({
        where:{batchId,userId:user.id,ownerType:'USER',submittedAt:{not:null}},
        select:{activityId:true},
      }),
      prisma.activity.count({where:{batchId,type:{notIn:gameTypes as any}}}),
    ]);

    const planData=plan?{
      id:plan.id,status:plan.status,startDate:plan.startDate,
      reviewD7:plan.reviewD7,reviewD14:plan.reviewD14,reviewD30:plan.reviewD30,
      countdown:{
        d7:daysUntil(plan.reviewD7),d14:daysUntil(plan.reviewD14),d30:daysUntil(plan.reviewD30),
      },
      targets:plan.targets.map(t=>({sequence:t.sequence,behavior:t.behavior})),
      followUps:plan.followUps.map(f=>({kind:f.kind,progressPct:Number(f.progressPct),statusLabel:f.statusLabel,submittedAt:f.submittedAt})),
    }:null;

    return NextResponse.json({
      batch,
      team:membership.team,
      diagnostic:{pre:diag('PRE'),post:diag('POST')},
      test:{
        pre:pre?{score:pre.score,submittedAt:pre.submittedAt}:null,
        post:post?{score:post.score,submittedAt:post.submittedAt}:null,
        gain:pre&&post?post.score-pre.score:null,
      },
      l1:evaluation?{averageScore:evaluation.averageScore===null?null:Number(evaluation.averageScore),submittedAt:evaluation.submittedAt}:null,
      badges,
      plan:planData,
      completion:{
        individualSubmissions:new Set(individualSubmissions.map(s=>s.activityId)).size,
        individualActivityCount,
        gamesParticipated:badges.filter(b=>b.earned).length,
        totalGames:badges.length,
      },
    });
  }catch(e){return jsonError(e)}
}
