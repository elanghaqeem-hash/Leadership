import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const bodySchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('ASSIGN'),userId:z.string().uuid(),teamId:z.string().uuid().nullable()}),
  z.object({action:z.literal('RANDOMIZE')}),
  z.object({action:z.literal('CLEAR')}),
]);

function shuffle<T>(items:T[]){
  const out=[...items];
  for(let i=out.length-1;i>0;i--){
    const j=randomInt(i+1);
    [out[i],out[j]]=[out[j],out[i]];
  }
  return out;
}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
 try{
  const {batchId}=await params;
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true,teamCount:true}});
  if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
  await assertPermission('TEAM_MANAGE',{tenantId:batch.tenantId,batchId});
  const teams=await prisma.team.findMany({where:{batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}});
  const participants=await prisma.batchMembership.findMany({
    where:{batchId,role:'PARTICIPANT',isActive:true},
    orderBy:{joinedAt:'asc'},
    select:{
      id:true,userId:true,teamId:true,joinedAt:true,
      user:{select:{
        name:true,email:true,
        tenantMemberships:{where:{tenantId:batch.tenantId},take:1,select:{displayName:true,employeeNo:true,unit:true,title:true}},
      }},
    },
  });
  return NextResponse.json({
    batch,
    teams,
    participants:participants.map(p=>({
      id:p.id,userId:p.userId,teamId:p.teamId,joinedAt:p.joinedAt,
      name:p.user.tenantMemberships[0]?.displayName||p.user.name,
      email:p.user.email,
      employeeNo:p.user.tenantMemberships[0]?.employeeNo||null,
      unit:p.user.tenantMemberships[0]?.unit||null,
      title:p.user.tenantMemberships[0]?.title||null,
    })),
  });
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{batchId:string}>}){
 try{
  const {batchId}=await params;
  const input=bodySchema.parse(await req.json());
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true}});
  if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
  const actor=await assertPermission('TEAM_MANAGE',{tenantId:batch.tenantId,batchId});

  if(input.action==='ASSIGN'){
    const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId,userId:input.userId}},select:{id:true,role:true,isActive:true}});
    if(!membership||membership.role!=='PARTICIPANT'||!membership.isActive)throw new HttpError('Participant tidak valid',400);
    if(input.teamId){
      const team=await prisma.team.findUnique({where:{id:input.teamId},select:{batchId:true}});
      if(!team||team.batchId!==batchId)throw new HttpError('Tim tidak valid',400);
    }
    await prisma.batchMembership.update({where:{id:membership.id},data:{teamId:input.teamId}});
  }else{
    const participants=await prisma.batchMembership.findMany({where:{batchId,role:'PARTICIPANT',isActive:true},select:{id:true}});
    if(input.action==='CLEAR'){
      await prisma.batchMembership.updateMany({where:{id:{in:participants.map(p=>p.id)}},data:{teamId:null}});
    }else{
      const teams=await prisma.team.findMany({where:{batchId},orderBy:{number:'asc'},select:{id:true}});
      if(!teams.length)throw new HttpError('Batch belum memiliki tim',409);
      const randomized=shuffle(participants);
      await prisma.$transaction(randomized.map((p,index)=>prisma.batchMembership.update({
        where:{id:p.id},data:{teamId:teams[index%teams.length].id},
      })));
    }
  }

  await prisma.auditLog.create({data:{
    actorUserId:actor.id,tenantId:batch.tenantId,batchId,action:'UPDATE',
    resourceType:'TeamAssignment',resourceId:batchId,metadata:{action:input.action},
  }});
  publishBatchEvent(batchId,'TEAM_ASSIGNMENT',batchId);
  return NextResponse.json({ok:true});
 }catch(e){return jsonError(e)}
}
