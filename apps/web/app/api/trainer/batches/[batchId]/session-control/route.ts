import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

const patchSchema=z.object({
  activityId:z.string().uuid(),
  action:z.enum(['OPEN','LOCK','REVEAL','CLOSE']),
});

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
 try{
  const {batchId}=await params;
  const batch=await prisma.batch.findUnique({
    where:{id:batchId},
    select:{id:true,tenantId:true,code:true,name:true,status:true,startDate:true,endDate:true,joinCode:true,teamCount:true},
  });
  if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
  await assertPermission('SESSION_CONTROL',{tenantId:batch.tenantId,batchId});

  const sessions=await prisma.session.findMany({
    where:{batchId},
    orderBy:{sequence:'asc'},
    include:{
      activities:{
        orderBy:{sequence:'asc'},
        include:{_count:{select:{submissions:true,gameRounds:true}}},
      },
    },
  });
  const participantCount=await prisma.batchMembership.count({where:{batchId,role:'PARTICIPANT',isActive:true}});
  const teams=await prisma.team.findMany({
    where:{batchId},orderBy:{number:'asc'},
    select:{id:true,name:true,number:true,_count:{select:{members:true}}},
  });
  return NextResponse.json({batch,participantCount,teams,sessions});
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{batchId:string}>}){
 try{
  const {batchId}=await params;
  const input=patchSchema.parse(await req.json());
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true}});
  if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
  const actor=await assertPermission('SESSION_CONTROL',{tenantId:batch.tenantId,batchId});
  const activity=await prisma.activity.findUnique({where:{id:input.activityId},select:{id:true,batchId:true,status:true,title:true,type:true}});
  if(!activity||activity.batchId!==batchId)return NextResponse.json({error:'Aktivitas tidak ditemukan'},{status:404});

  const now=new Date();
  const data=input.action==='OPEN'
    ? {status:'OPEN' as const,openedAt:now,lockedAt:null,closedAt:null}
    : input.action==='LOCK'
      ? {status:'LOCKED' as const,lockedAt:now}
      : input.action==='REVEAL'
        ? {status:'REVEALED' as const,revealedAt:now,lockedAt:activity.status==='OPEN'?now:undefined}
        : {status:'CLOSED' as const,closedAt:now};

  if(input.action==='REVEAL'&&!['OPEN','LOCKED','REVEALED'].includes(activity.status)){
    throw new HttpError('Reveal hanya dapat dilakukan setelah aktivitas dibuka',409);
  }
  if(input.action==='LOCK'&&!['OPEN','REVEALED','LOCKED'].includes(activity.status)){
    throw new HttpError('Lock hanya dapat dilakukan pada aktivitas yang sudah dibuka',409);
  }

  const updated=await prisma.$transaction(async tx=>{
    const row=await tx.activity.update({where:{id:activity.id},data});
    await tx.auditLog.create({
      data:{
        actorUserId:actor.id,tenantId:batch.tenantId,batchId,
        action:input.action==='OPEN'?'OPEN_ACTIVITY':input.action==='REVEAL'?'REVEAL_KEY':'UPDATE',
        resourceType:'Activity',resourceId:activity.id,
        beforeHash:activity.status,afterHash:row.status,
        metadata:{title:activity.title,type:activity.type,controlAction:input.action},
      },
    });
    return row;
  });
  return NextResponse.json({ok:true,activity:updated});
 }catch(e){return jsonError(e)}
}
