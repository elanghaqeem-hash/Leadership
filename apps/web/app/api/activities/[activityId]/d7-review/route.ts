import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { managerFollowUpStatus } from '@ltw/scoring';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const schema=z.object({
  answers:z.array(z.string().trim().min(1).max(2000)).length(5),
  progressPct:z.number().min(0).max(100),
});

async function load(activityId:string){
  const activity=await prisma.activity.findUnique({
    where:{id:activityId},
    select:{id:true,tenantId:true,batchId:true,type:true,status:true,title:true},
  });
  if(!activity||activity.type!=='THIRTY_DAY_PLAN')throw new HttpError('30-Day Plan tidak ditemukan',404);
  const item=await prisma.contentItem.findFirst({
    where:{code:'MANAGER_FOLLOWUP_V1',isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},
    orderBy:{version:'desc'},select:{code:true,version:true,payload:true},
  });
  if(!item)throw new HttpError('Konfigurasi follow-up tidak ditemukan',404);
  const payload=item.payload as {questions?:unknown};
  if(!Array.isArray(payload.questions)||payload.questions.length!==5)throw new HttpError('Konfigurasi follow-up tidak valid',500);
  return{activity,item,questions:payload.questions.map(String)};
}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
  try{
    const {activityId}=await params;
    const {activity,item,questions}=await load(activityId);
    const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
    const membership=await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
      select:{role:true,isActive:true},
    });
    if(!membership?.isActive||membership.role!=='PARTICIPANT')throw new HttpError('Hanya participant aktif yang dapat mengisi D+7 self review',403);
    const plan=await prisma.thirtyDayPlan.findUnique({
      where:{batchId_participantUserId:{batchId:activity.batchId,participantUserId:user.id}},
      select:{id:true,reviewD7:true,status:true},
    });
    if(!plan)throw new HttpError('Aktifkan 30-Day Plan terlebih dahulu',409);
    const existing=await prisma.followUp.findUnique({
      where:{planId_kind:{planId:plan.id,kind:'D7'}},
      select:{answers:true,progressPct:true,statusLabel:true,submittedAt:true},
    });
    return NextResponse.json({
      config:{code:item.code,version:item.version,questions},
      plan:{id:plan.id,reviewD7:plan.reviewD7,status:plan.status},
      existing:existing?{
        answers:existing.answers,
        progressPct:Number(existing.progressPct),
        statusLabel:existing.statusLabel,
        submittedAt:existing.submittedAt,
      }:null,
    });
  }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
  try{
    const {activityId}=await params;
    const input=schema.parse(await req.json());
    const {activity,questions}=await load(activityId);
    const user=await requireUser();
    await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
    const membership=await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
      select:{role:true,isActive:true},
    });
    if(!membership?.isActive||membership.role!=='PARTICIPANT')throw new HttpError('Hanya participant aktif yang dapat mengisi D+7 self review',403);
    const plan=await prisma.thirtyDayPlan.findUnique({
      where:{batchId_participantUserId:{batchId:activity.batchId,participantUserId:user.id}},
      select:{id:true},
    });
    if(!plan)throw new HttpError('Aktifkan 30-Day Plan terlebih dahulu',409);

    const statusLabel=managerFollowUpStatus(input.progressPct);
    const answers={questions,answers:input.answers};
    const follow=await prisma.$transaction(async tx=>{
      const row=await tx.followUp.upsert({
        where:{planId_kind:{planId:plan.id,kind:'D7'}},
        create:{
          planId:plan.id,kind:'D7',authorUserId:user.id,
          answers:answers as Prisma.InputJsonValue,progressPct:input.progressPct,statusLabel,submittedAt:new Date(),
        },
        update:{
          authorUserId:user.id,answers:answers as Prisma.InputJsonValue,
          progressPct:input.progressPct,statusLabel,submittedAt:new Date(),
        },
      });
      await tx.auditLog.create({data:{
        actorUserId:user.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'UPDATE',
        resourceType:'FollowUp',resourceId:row.id,
        metadata:{kind:'D7',progressPct:input.progressPct,statusLabel,selfReview:true},
      }});
      return row;
    });
    publishBatchEvent(activity.batchId,'FOLLOW_UP',plan.id);
    return NextResponse.json({ok:true,progressPct:Number(follow.progressPct),statusLabel:follow.statusLabel,submittedAt:follow.submittedAt});
  }catch(e){return jsonError(e)}
}
