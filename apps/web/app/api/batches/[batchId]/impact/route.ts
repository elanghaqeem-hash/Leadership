import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

function avg(values:number[]){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}
function round(value:number|null,digits=2){
  if(value===null)return null;
  const p=10**digits;return Math.round(value*p)/p;
}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},
      select:{id:true,tenantId:true,code:true,name:true,status:true,startDate:true,endDate:true},
    });
    if(!batch)throw new HttpError('Batch tidak ditemukan',404);

    const participants=await prisma.batchMembership.findMany({
      where:{batchId,role:'PARTICIPANT',isActive:true},
      select:{userId:true},
    });
    const participantIds=participants.map(p=>p.userId);
    const actor=await assertPermission('AGGREGATE_DASHBOARD_READ',{
      tenantId:batch.tenantId,batchId,aggregateSize:participantIds.length,
    });

    const test=await prisma.test.findFirst({where:{tenantId:null,code:'LTW_PRE_POST',version:1},select:{id:true}});
    const attempts=test?await prisma.testAttempt.findMany({
      where:{testId:test.id,batchId,userId:{in:participantIds},submittedAt:{not:null}},
      select:{userId:true,kind:true,score:true},
    }):[];

    const preAttempts=attempts.filter(a=>a.kind==='PRE');
    const postAttempts=attempts.filter(a=>a.kind==='POST');
    const gains=participantIds.flatMap(userId=>{
      const pre=preAttempts.find(a=>a.userId===userId);
      const post=postAttempts.find(a=>a.userId===userId);
      return pre&&post?[post.score-pre.score]:[];
    });

    const evaluation=await prisma.evaluationL1.findMany({
      where:{batchId,participantUserId:{in:participantIds},submittedAt:{not:null}},
      select:{averageScore:true},
    });
    const evalScores=evaluation.flatMap(e=>e.averageScore===null?[]:[Number(e.averageScore)]);

    const diagnosticActivities=await prisma.activity.findMany({
      where:{batchId,type:'SELF_DIAGNOSTIC'},
      select:{id:true,config:true},
    });
    const preDiagnostic=diagnosticActivities.find(a=>(a.config as any)?.mode==='PRE');
    const postDiagnostic=diagnosticActivities.find(a=>(a.config as any)?.mode==='POST');
    const diagnosticSubs=await prisma.submission.findMany({
      where:{
        batchId,userId:{in:participantIds},ownerType:'USER',
        activityId:{in:[preDiagnostic?.id,postDiagnostic?.id].filter(Boolean) as string[]},
      },
      select:{activityId:true,userId:true,score:true},
    });
    const diagnosticGains=participantIds.flatMap(userId=>{
      const pre=diagnosticSubs.find(s=>s.userId===userId&&s.activityId===preDiagnostic?.id&&s.score!==null);
      const post=diagnosticSubs.find(s=>s.userId===userId&&s.activityId===postDiagnostic?.id&&s.score!==null);
      return pre&&post?[Number(post.score)-Number(pre.score)]:[];
    });

    const plans=await prisma.thirtyDayPlan.findMany({
      where:{batchId,participantUserId:{in:participantIds}},
      select:{
        id:true,status:true,participantUserId:true,
        followUps:{select:{kind:true,progressPct:true,statusLabel:true,submittedAt:true}},
      },
    });
    const followKinds=['D7','D14','D30'] as const;
    const followUp=Object.fromEntries(followKinds.map(kind=>{
      const rows=plans.flatMap(p=>p.followUps.filter(f=>f.kind===kind&&f.submittedAt));
      const progress=rows.map(r=>Number(r.progressPct));
      const statuses={
        ON_TRACK:rows.filter(r=>r.statusLabel==='ON_TRACK').length,
        PERLU_DORONGAN:rows.filter(r=>r.statusLabel==='PERLU_DORONGAN').length,
        PERLU_INTERVENSI:rows.filter(r=>r.statusLabel==='PERLU_INTERVENSI').length,
      };
      return[kind,{completed:rows.length,completionPct:participantIds.length?rows.length/participantIds.length*100:0,averageProgressPct:round(avg(progress)),statuses}];
    }));

    const metrics=await prisma.impactMetric.findMany({
      where:{batchId,participantUserId:{in:participantIds}},
      select:{code:true,name:true,direction:true,baseline:true,day30:true,percentChange:true,improved:true},
    });
    const completedMetrics=metrics.filter(m=>m.baseline!==null&&m.day30!==null);
    const improvedMetrics=completedMetrics.filter(m=>m.improved===true);
    const byMetric=Object.values(metrics.reduce<Record<string,{code:string;name:string;direction:string;rows:typeof metrics}>>((acc,m)=>{
      if(!acc[m.code])acc[m.code]={code:m.code,name:m.name,direction:m.direction,rows:[]};
      acc[m.code].rows.push(m);return acc;
    },{})).map(group=>{
      const done=group.rows.filter(r=>r.baseline!==null&&r.day30!==null);
      const pct=done.flatMap(r=>r.percentChange===null?[]:[Number(r.percentChange)*100]);
      return{
        code:group.code,name:group.name,direction:group.direction,
        completed:done.length,improved:done.filter(r=>r.improved===true).length,
        averagePercentChange:round(avg(pct)),
      };
    });

    const response={
      batch,
      population:{participants:participantIds.length},
      level1:{
        evaluationCompleted:evaluation.length,
        completionPct:participantIds.length?round(evaluation.length/participantIds.length*100):0,
        averageScore:round(avg(evalScores)),
      },
      level2:{
        preCompleted:preAttempts.length,postCompleted:postAttempts.length,
        preAverage:round(avg(preAttempts.map(x=>x.score))),
        postAverage:round(avg(postAttempts.map(x=>x.score))),
        matchedGainCount:gains.length,averageGain:round(avg(gains)),
        selfDiagnosticMatched:diagnosticGains.length,averageSelfDiagnosticGain:round(avg(diagnosticGains)),
      },
      level3:{
        plansCreated:plans.length,
        planCompletionPct:participantIds.length?round(plans.length/participantIds.length*100):0,
        completedPlans:plans.filter(p=>p.status==='COMPLETED').length,
        followUp,
      },
      level4:{
        metricPairsCompleted:completedMetrics.length,
        improvedMetricPairs:improvedMetrics.length,
        improvementRatePct:completedMetrics.length?round(improvedMetrics.length/completedMetrics.length*100):null,
        byMetric,
      },
      privacy:{
        aggregateOnly:true,
        population:participantIds.length,
        requestedBy:actor.platformRole==='SUPER_ADMIN'?'SUPER_ADMIN':'BATCH_ROLE',
      },
    };
    return NextResponse.json(response);
  }catch(e){return jsonError(e)}
}
