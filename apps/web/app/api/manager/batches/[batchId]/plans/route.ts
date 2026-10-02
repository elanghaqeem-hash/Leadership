import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { impactMetric, managerFollowUpStatus } from '@ltw/scoring';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const schema=z.object({
  participantUserId:z.string().uuid(),
  kind:z.enum(['D14','D30']),
  answers:z.array(z.string().trim().min(1).max(2000)).length(5),
  progressPct:z.number().min(0).max(100),
  sbiFeedback:z.string().trim().max(2000).optional().default(''),
  baselineMetrics:z.record(z.string(),z.number().finite().nullable()).optional().default({}),
  day30Metrics:z.record(z.string(),z.number().finite().nullable()).optional().default({}),
});

type FollowConfig={questions:string[];thresholds:{onTrack:number;needsPush:number}};

async function loadBatch(batchId:string){
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
  if(!batch)throw new HttpError('Batch tidak ditemukan',404);
  return batch;
}

async function followConfig(tenantId:string){
  const item=await prisma.contentItem.findFirst({
    where:{code:'MANAGER_FOLLOWUP_V1',isPublished:true,OR:[{tenantId:null},{tenantId}]},
    orderBy:{version:'desc'},select:{payload:true,version:true,code:true},
  });
  if(!item)throw new HttpError('Konfigurasi manager follow-up tidak ditemukan',404);
  const payload=item.payload as unknown as FollowConfig;
  if(!Array.isArray(payload.questions)||payload.questions.length!==5)throw new HttpError('Konfigurasi manager follow-up tidak valid',500);
  return{item,payload};
}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await loadBatch(batchId);
    const user=await requireUser();
    const membership=await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId,userId:user.id}},
      select:{role:true,isActive:true},
    });
    if(!membership?.isActive||membership.role!=='LINE_MANAGER')throw new HttpError('Akses Line Manager diperlukan',403);

    const links=await prisma.participantManagerLink.findMany({
      where:{batchId,managerUserId:user.id},
      select:{participantUserId:true,participant:{select:{name:true,email:true}}},
      orderBy:{createdAt:'asc'},
    });
    const {item,payload}=await followConfig(batch.tenantId);
    const participantIds=links.map(x=>x.participantUserId);
    const plans=participantIds.length?await prisma.thirtyDayPlan.findMany({
      where:{batchId,participantUserId:{in:participantIds}},
      include:{
        targets:{orderBy:{sequence:'asc'}},
        followUps:{orderBy:{kind:'asc'}},
      },
    }):[];
    const metrics=participantIds.length?await prisma.impactMetric.findMany({
      where:{batchId,participantUserId:{in:participantIds}},
      orderBy:[{participantUserId:'asc'},{name:'asc'}],
    }):[];

    const rows=[];
    for(const link of links){
      await assertPermission('SUBORDINATE_PLAN_READ',{tenantId:batch.tenantId,batchId,resourceUserId:link.participantUserId});
      const plan=plans.find(p=>p.participantUserId===link.participantUserId)??null;
      rows.push({
        participant:{id:link.participantUserId,name:link.participant.name,email:link.participant.email},
        plan:plan?{
          id:plan.id,startDate:plan.startDate,reviewD7:plan.reviewD7,reviewD14:plan.reviewD14,reviewD30:plan.reviewD30,status:plan.status,
          targets:plan.targets.map(t=>({sequence:t.sequence,behavior:t.behavior,elements:t.elements})),
          followUps:plan.followUps.map(f=>({kind:f.kind,answers:f.answers,progressPct:Number(f.progressPct),statusLabel:f.statusLabel,submittedAt:f.submittedAt})),
        }:null,
        metrics:metrics.filter(m=>m.participantUserId===link.participantUserId).map(m=>({
          code:m.code,name:m.name,direction:m.direction,
          baseline:m.baseline===null?null:Number(m.baseline),day30:m.day30===null?null:Number(m.day30),
          percentChange:m.percentChange===null?null:Number(m.percentChange),improved:m.improved,
        })),
      });
    }

    return NextResponse.json({
      batch,
      config:{code:item.code,version:item.version,questions:payload.questions,thresholds:payload.thresholds},
      subordinates:rows,
    });
  }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const input=schema.parse(await req.json());
    const batch=await loadBatch(batchId);
    const manager=await requireUser();
    await assertPermission('SUBORDINATE_FOLLOWUP_WRITE',{tenantId:batch.tenantId,batchId,resourceUserId:input.participantUserId});
    const {payload}=await followConfig(batch.tenantId);
    const plan=await prisma.thirtyDayPlan.findUnique({
      where:{batchId_participantUserId:{batchId,participantUserId:input.participantUserId}},
      select:{id:true,status:true},
    });
    if(!plan)throw new HttpError('Participant belum memiliki 30-Day Plan',409);

    const statusLabel=managerFollowUpStatus(input.progressPct);
    const answers={questions:payload.questions,answers:input.answers,sbiFeedback:input.sbiFeedback};

    const result=await prisma.$transaction(async tx=>{
      const follow=await tx.followUp.upsert({
        where:{planId_kind:{planId:plan.id,kind:input.kind}},
        create:{
          planId:plan.id,kind:input.kind,authorUserId:manager.id,
          answers:answers as Prisma.InputJsonValue,progressPct:input.progressPct,statusLabel,submittedAt:new Date(),
        },
        update:{
          authorUserId:manager.id,answers:answers as Prisma.InputJsonValue,
          progressPct:input.progressPct,statusLabel,submittedAt:new Date(),
        },
      });

      const updatedMetrics:any[]=[];
      const metricRows=await tx.impactMetric.findMany({
        where:{batchId,participantUserId:input.participantUserId},
      });
      for(const metric of metricRows){
        const baselineProvided=metric.code in input.baselineMetrics;
        const baselineInput=baselineProvided?input.baselineMetrics[metric.code]:undefined;
        const baselineValue=baselineProvided
          ? (baselineInput===null?null:baselineInput)
          : (metric.baseline===null?null:Number(metric.baseline));

        if(input.kind!=='D30'){
          if(!baselineProvided)continue;
          const updated=await tx.impactMetric.update({
            where:{id:metric.id},
            data:{baseline:baselineValue,percentChange:null,improved:null},
          });
          updatedMetrics.push(updated);
          continue;
        }

        if(!(metric.code in input.day30Metrics)&&!baselineProvided)continue;
        const day30Input=metric.code in input.day30Metrics?input.day30Metrics[metric.code]:(metric.day30===null?null:Number(metric.day30));
        let percentChange:number|null=null;
        let improved:boolean|null=null;
        if(baselineValue!==null&&day30Input!==null){
          const scored=impactMetric(baselineValue,day30Input,metric.direction);
          percentChange=scored.percentChange;
          improved=scored.status===null?null:scored.status==='MEMBAIK';
        }
        const updated=await tx.impactMetric.update({
          where:{id:metric.id},
          data:{baseline:baselineValue,day30:day30Input,percentChange,improved},
        });
        updatedMetrics.push(updated);
      }
      if(input.kind==='D30'){
        await tx.thirtyDayPlan.update({where:{id:plan.id},data:{status:'COMPLETED'}});
      }

      await tx.auditLog.create({data:{
        actorUserId:manager.id,tenantId:batch.tenantId,batchId,action:'UPDATE',
        resourceType:'FollowUp',resourceId:follow.id,
        metadata:{participantUserId:input.participantUserId,kind:input.kind,progressPct:input.progressPct,statusLabel,sbiFeedbackProvided:Boolean(input.sbiFeedback),baselineMetricsUpdated:Object.keys(input.baselineMetrics).length},
      }});
      return{follow,updatedMetrics};
    });

    publishBatchEvent(batchId,'FOLLOW_UP',plan.id);
    return NextResponse.json({
      ok:true,kind:result.follow.kind,progressPct:Number(result.follow.progressPct),
      statusLabel:result.follow.statusLabel,submittedAt:result.follow.submittedAt,
      updatedMetrics:result.updatedMetrics.length,
    });
  }catch(e){return jsonError(e)}
}
