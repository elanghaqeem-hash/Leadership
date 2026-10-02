import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const schema=z.object({
  ratings:z.array(z.number().int().min(1).max(5)).length(8),
  comment:z.string().trim().max(3000).optional().default(''),
});

async function loadActivity(activityId:string){
  const activity=await prisma.activity.findUnique({
    where:{id:activityId},
    select:{id:true,tenantId:true,batchId:true,type:true,status:true,config:true,title:true},
  });
  if(!activity||activity.type!=='EVALUATION_L1')throw new HttpError('Evaluasi L1 tidak ditemukan',404);
  const cfg=activity.config as {contentCode?:unknown};
  const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'EVALUATION_L1_V1';
  const content=await prisma.contentItem.findFirst({
    where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},
    orderBy:{version:'desc'},
    select:{code:true,version:true,payload:true,title:true},
  });
  if(!content)throw new HttpError('Konten Evaluasi L1 tidak ditemukan',404);
  const payload=content.payload as {statements?:unknown};
  if(!Array.isArray(payload.statements)||payload.statements.length!==8)throw new HttpError('Konfigurasi Evaluasi L1 tidak valid',500);
  return{activity,content,statements:payload.statements.map(String)};
}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
  try{
    const {activityId}=await params;
    const {activity,content,statements}=await loadActivity(activityId);
    const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
    const existing=await prisma.evaluationL1.findUnique({
      where:{batchId_participantUserId:{batchId:activity.batchId,participantUserId:user.id}},
      select:{answers:true,averageScore:true,submittedAt:true},
    });
    return NextResponse.json({
      activity:{id:activity.id,title:activity.title,status:activity.status},
      content:{code:content.code,version:content.version},
      statements,
      existing:existing?{
        answers:existing.answers,
        averageScore:existing.averageScore?Number(existing.averageScore):null,
        submittedAt:existing.submittedAt,
      }:null,
    });
  }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
  try{
    const {activityId}=await params;
    const input=schema.parse(await req.json());
    const {activity,content,statements}=await loadActivity(activityId);
    if(activity.status!=='OPEN')throw new HttpError('Evaluasi L1 belum dibuka atau sudah ditutup',409);
    const user=await requireUser();
    await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
    const membership=await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
      select:{role:true,isActive:true},
    });
    if(!membership?.isActive||membership.role!=='PARTICIPANT')throw new HttpError('Hanya participant aktif yang dapat mengisi evaluasi',403);

    const average=input.ratings.reduce((a,b)=>a+b,0)/input.ratings.length;
    const answers={ratings:input.ratings,comment:input.comment,statements};
    const submissionKey=`${activity.id}:${user.id}`;

    const result=await prisma.$transaction(async tx=>{
      const evaluation=await tx.evaluationL1.upsert({
        where:{batchId_participantUserId:{batchId:activity.batchId,participantUserId:user.id}},
        create:{
          tenantId:activity.tenantId,batchId:activity.batchId,participantUserId:user.id,
          answers:answers as Prisma.InputJsonValue,averageScore:average,submittedAt:new Date(),
        },
        update:{
          answers:answers as Prisma.InputJsonValue,averageScore:average,submittedAt:new Date(),
        },
      });
      const submission=await tx.submission.upsert({
        where:{submissionKey},
        create:{
          tenantId:activity.tenantId,batchId:activity.batchId,activityId:activity.id,
          ownerType:'USER',userId:user.id,submissionKey,
          payload:{ratings:input.ratings,comment:input.comment,contentCode:content.code} as Prisma.InputJsonValue,
          score:average,scoreDetail:{average} as Prisma.InputJsonValue,submittedAt:new Date(),
        },
        update:{
          payload:{ratings:input.ratings,comment:input.comment,contentCode:content.code} as Prisma.InputJsonValue,
          score:average,scoreDetail:{average} as Prisma.InputJsonValue,submittedAt:new Date(),version:{increment:1},
        },
      });
      return{evaluation,submission};
    });

    publishBatchEvent(activity.batchId,'SUBMISSION',result.submission.id);
    return NextResponse.json({ok:true,averageScore:average,submittedAt:result.evaluation.submittedAt});
  }catch(e){return jsonError(e)}
}
