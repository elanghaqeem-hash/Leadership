import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const targetSchema=z.object({
  behavior:z.string().trim().min(5).max(1000),
  successMeasure:z.string().trim().min(3).max(1000),
  evidence:z.string().trim().min(3).max(1000),
  firstAction:z.string().trim().min(3).max(1000),
  supportNeeded:z.string().trim().max(1000).optional().default(''),
});
const schema=z.object({
  startDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targets:z.array(targetSchema).length(3),
  baselines:z.record(z.string(),z.number().finite().nullable()),
});

type MetricConfig={name:string;unit:string;goodDirection:string};

function metricCode(name:string){
  return name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}
function toDate(iso:string){
  const d=new Date(iso+'T00:00:00.000Z');
  if(Number.isNaN(d.getTime()))throw new HttpError('Tanggal mulai tidak valid',400);
  return d;
}
function addDays(date:Date,days:number){
  const d=new Date(date);d.setUTCDate(d.getUTCDate()+days);return d;
}
function direction(value:string):'UP_IS_BETTER'|'DOWN_IS_BETTER'{
  return value.trim().toLowerCase()==='naik'?'UP_IS_BETTER':'DOWN_IS_BETTER';
}

async function loadActivity(activityId:string){
  const activity=await prisma.activity.findUnique({
    where:{id:activityId},
    select:{id:true,tenantId:true,batchId:true,type:true,status:true,config:true,title:true},
  });
  if(!activity||activity.type!=='THIRTY_DAY_PLAN')throw new HttpError('30-Day Plan tidak ditemukan',404);
  const cfg=activity.config as {contentCode?:unknown};
  const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'IMPACT_METRICS_V1';
  const content=await prisma.contentItem.findFirst({
    where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},
    orderBy:{version:'desc'},select:{code:true,version:true,payload:true,title:true},
  });
  if(!content)throw new HttpError('Konfigurasi impact metrics tidak ditemukan',404);
  const payload=content.payload as {metrics?:unknown};
  if(!Array.isArray(payload.metrics)||payload.metrics.length===0)throw new HttpError('Konfigurasi impact metrics tidak valid',500);
  const metrics=(payload.metrics as MetricConfig[]).map(m=>({
    code:metricCode(String(m.name)),name:String(m.name),unit:String(m.unit),
    direction:direction(String(m.goodDirection)),
  }));
  return{activity,content,metrics};
}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
  try{
    const {activityId}=await params;
    const {activity,content,metrics}=await loadActivity(activityId);
    const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
    const membership=await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
      select:{role:true,isActive:true},
    });
    if(!membership?.isActive||membership.role!=='PARTICIPANT')throw new HttpError('Hanya participant aktif yang dapat membuka 30-Day Plan',403);

    const plan=await prisma.thirtyDayPlan.findUnique({
      where:{batchId_participantUserId:{batchId:activity.batchId,participantUserId:user.id}},
      include:{targets:{orderBy:{sequence:'asc'}}},
    });
    const metricRows=await prisma.impactMetric.findMany({
      where:{batchId:activity.batchId,participantUserId:user.id},
      select:{code:true,name:true,direction:true,baseline:true,day30:true,percentChange:true,improved:true},
    });
    return NextResponse.json({
      activity:{id:activity.id,title:activity.title,status:activity.status},
      content:{code:content.code,version:content.version},
      metrics,
      plan:plan?{
        id:plan.id,startDate:plan.startDate,reviewD7:plan.reviewD7,reviewD14:plan.reviewD14,reviewD30:plan.reviewD30,status:plan.status,
        targets:plan.targets.map(t=>({sequence:t.sequence,behavior:t.behavior,elements:t.elements})),
      }:null,
      metricRows:metricRows.map(m=>({...m,baseline:m.baseline===null?null:Number(m.baseline),day30:m.day30===null?null:Number(m.day30),percentChange:m.percentChange===null?null:Number(m.percentChange)})),
    });
  }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
  try{
    const {activityId}=await params;
    const input=schema.parse(await req.json());
    const {activity,content,metrics}=await loadActivity(activityId);
    if(activity.status!=='OPEN')throw new HttpError('30-Day Plan belum dibuka atau sudah ditutup',409);
    const user=await requireUser();
    await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
    const membership=await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
      select:{role:true,isActive:true},
    });
    if(!membership?.isActive||membership.role!=='PARTICIPANT')throw new HttpError('Hanya participant aktif yang dapat menyimpan 30-Day Plan',403);

    const startDate=toDate(input.startDate);
    const managerLink=await prisma.participantManagerLink.findUnique({
      where:{batchId_participantUserId:{batchId:activity.batchId,participantUserId:user.id}},
      select:{managerUserId:true},
    });
    const knownCodes=new Set(metrics.map(m=>m.code));
    for(const code of Object.keys(input.baselines))if(!knownCodes.has(code))throw new HttpError('Kode impact metric tidak valid: '+code,400);
    const submissionKey=`${activity.id}:${user.id}`;

    const result=await prisma.$transaction(async tx=>{
      const plan=await tx.thirtyDayPlan.upsert({
        where:{batchId_participantUserId:{batchId:activity.batchId,participantUserId:user.id}},
        create:{
          tenantId:activity.tenantId,batchId:activity.batchId,participantUserId:user.id,managerUserId:managerLink?.managerUserId??null,
          startDate,reviewD7:addDays(startDate,7),reviewD14:addDays(startDate,14),reviewD30:addDays(startDate,30),status:'ACTIVE',
        },
        update:{
          managerUserId:managerLink?.managerUserId??null,startDate,reviewD7:addDays(startDate,7),reviewD14:addDays(startDate,14),reviewD30:addDays(startDate,30),status:'ACTIVE',
        },
      });
      await tx.planTarget.deleteMany({where:{planId:plan.id}});
      await tx.planTarget.createMany({data:input.targets.map((t,i)=>({
        planId:plan.id,sequence:i+1,behavior:t.behavior,
        elements:{successMeasure:t.successMeasure,evidence:t.evidence,firstAction:t.firstAction,supportNeeded:t.supportNeeded} as Prisma.InputJsonValue,
      }))});

      for(const metric of metrics){
        const baseline=input.baselines[metric.code]??null;
        await tx.impactMetric.upsert({
          where:{batchId_participantUserId_code:{batchId:activity.batchId,participantUserId:user.id,code:metric.code}},
          create:{
            tenantId:activity.tenantId,batchId:activity.batchId,participantUserId:user.id,
            code:metric.code,name:metric.name,direction:metric.direction,baseline,
          },
          update:{name:metric.name,direction:metric.direction,baseline},
        });
      }

      const normalized={
        planId:plan.id,startDate:input.startDate,targets:input.targets,baselines:input.baselines,contentCode:content.code,
        reviewDates:{d7:addDays(startDate,7).toISOString(),d14:addDays(startDate,14).toISOString(),d30:addDays(startDate,30).toISOString()},
      };
      const submission=await tx.submission.upsert({
        where:{submissionKey},
        create:{
          tenantId:activity.tenantId,batchId:activity.batchId,activityId:activity.id,ownerType:'USER',userId:user.id,
          submissionKey,payload:normalized as Prisma.InputJsonValue,submittedAt:new Date(),
        },
        update:{payload:normalized as Prisma.InputJsonValue,submittedAt:new Date(),version:{increment:1}},
      });
      return{plan,submission};
    });

    publishBatchEvent(activity.batchId,'SUBMISSION',result.submission.id);
    return NextResponse.json({
      ok:true,planId:result.plan.id,
      reviewD7:result.plan.reviewD7,reviewD14:result.plan.reviewD14,reviewD30:result.plan.reviewD30,
      managerMapped:Boolean(managerLink?.managerUserId),
    });
  }catch(e){return jsonError(e)}
}
