import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const bodySchema=z.discriminatedUnion('action',[
  z.object({action:z.literal('SET'),observerUserId:z.string().uuid(),teamId:z.string().uuid(),assigned:z.boolean()}),
  z.object({action:z.literal('AUTO_DISTRIBUTE')}),
  z.object({action:z.literal('CLEAR')}),
]);

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
    if(!batch)throw new HttpError('Batch tidak ditemukan',404);
    await assertPermission('TEAM_MANAGE',{tenantId:batch.tenantId,batchId});

    const [observers,teams,assignments]=await Promise.all([
      prisma.batchMembership.findMany({
        where:{batchId,role:'CO_FACILITATOR',isActive:true},
        orderBy:{joinedAt:'asc'},
        select:{userId:true,user:{select:{name:true,email:true}}},
      }),
      prisma.team.findMany({
        where:{batchId},orderBy:{number:'asc'},
        select:{id:true,number:true,name:true,_count:{select:{members:true}}},
      }),
      prisma.observerTeamAssignment.findMany({
        where:{batchId},select:{id:true,observerUserId:true,teamId:true,createdAt:true},
      }),
    ]);

    return NextResponse.json({
      batch,
      observers:observers.map(o=>({userId:o.userId,name:o.user.name,email:o.user.email})),
      teams,
      assignments,
      coverage:{
        assignedTeams:new Set(assignments.map(a=>a.teamId)).size,
        totalTeams:teams.length,
        observersWithAssignment:new Set(assignments.map(a=>a.observerUserId)).size,
        totalObservers:observers.length,
      },
    });
  }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const input=bodySchema.parse(await req.json());
    const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true}});
    if(!batch)throw new HttpError('Batch tidak ditemukan',404);
    const actor=await assertPermission('TEAM_MANAGE',{tenantId:batch.tenantId,batchId});

    if(input.action==='SET'){
      const [observer,team]=await Promise.all([
        prisma.batchMembership.findUnique({
          where:{batchId_userId:{batchId,userId:input.observerUserId}},
          select:{role:true,isActive:true},
        }),
        prisma.team.findUnique({where:{id:input.teamId},select:{batchId:true}}),
      ]);
      if(!observer?.isActive||observer.role!=='CO_FACILITATOR')throw new HttpError('Observer/Co-Facilitator tidak valid',400);
      if(!team||team.batchId!==batchId)throw new HttpError('Tim tidak valid',400);
      if(input.assigned){
        await prisma.observerTeamAssignment.upsert({
          where:{batchId_observerUserId_teamId:{batchId,observerUserId:input.observerUserId,teamId:input.teamId}},
          create:{batchId,observerUserId:input.observerUserId,teamId:input.teamId},
          update:{},
        });
      }else{
        await prisma.observerTeamAssignment.deleteMany({
          where:{batchId,observerUserId:input.observerUserId,teamId:input.teamId},
        });
      }
    }else if(input.action==='CLEAR'){
      await prisma.observerTeamAssignment.deleteMany({where:{batchId}});
    }else{
      const [observers,teams]=await Promise.all([
        prisma.batchMembership.findMany({
          where:{batchId,role:'CO_FACILITATOR',isActive:true},
          orderBy:{joinedAt:'asc'},select:{userId:true},
        }),
        prisma.team.findMany({where:{batchId},orderBy:{number:'asc'},select:{id:true}}),
      ]);
      if(!observers.length)throw new HttpError('Belum ada Co-Facilitator aktif',409);
      if(!teams.length)throw new HttpError('Belum ada tim',409);
      await prisma.$transaction(async tx=>{
        await tx.observerTeamAssignment.deleteMany({where:{batchId}});
        await tx.observerTeamAssignment.createMany({
          data:teams.map((team,index)=>({
            batchId,
            teamId:team.id,
            observerUserId:observers[index%observers.length].userId,
          })),
        });
      });
    }

    await prisma.auditLog.create({data:{
      actorUserId:actor.id,tenantId:batch.tenantId,batchId,action:'UPDATE',
      resourceType:'ObserverTeamAssignment',resourceId:batchId,
      metadata:{action:input.action,...(input.action==='SET'?{observerUserId:input.observerUserId,teamId:input.teamId,assigned:input.assigned}:{})},
    }});
    publishBatchEvent(batchId,'OBSERVER_ASSIGNMENT',batchId);
    return NextResponse.json({ok:true});
  }catch(e){return jsonError(e)}
}
