import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const schema=z.object({status:z.enum(['PRE_TRAINING','ACTIVE','FOLLOW_UP','CLOSED','ARCHIVED'])});

const NEXT:Record<string,string[]>={
  DRAFT:['PRE_TRAINING'],
  PRE_TRAINING:['ACTIVE'],
  ACTIVE:['FOLLOW_UP'],
  FOLLOW_UP:['CLOSED'],
  CLOSED:['ARCHIVED'],
  ARCHIVED:[],
};

export async function PATCH(req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const input=schema.parse(await req.json());
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},
      select:{id:true,tenantId:true,status:true,programVersion:{select:{status:true}}},
    });
    if(!batch)throw new HttpError('Batch tidak ditemukan',404);
    const actor=await assertPermission('BATCH_MANAGE',{tenantId:batch.tenantId,batchId});

    if(!(NEXT[batch.status]||[]).includes(input.status)){
      throw new HttpError('Transisi status tidak valid: '+batch.status+' → '+input.status,409);
    }

    const [participantCount,leadTrainerCount,activityCount,unassignedCount]=await Promise.all([
      prisma.batchMembership.count({where:{batchId,role:'PARTICIPANT',isActive:true}}),
      prisma.batchMembership.count({where:{batchId,role:'LEAD_TRAINER',isActive:true}}),
      prisma.activity.count({where:{batchId}}),
      prisma.batchMembership.count({where:{batchId,role:'PARTICIPANT',isActive:true,teamId:null}}),
    ]);

    if(input.status==='PRE_TRAINING'){
      if(batch.programVersion.status!=='PUBLISHED')throw new HttpError('Program version belum PUBLISHED',409);
      if(activityCount===0)throw new HttpError('Aktivitas batch belum terbentuk',409);
      if(participantCount===0)throw new HttpError('Roster participant masih kosong',409);
      if(leadTrainerCount===0)throw new HttpError('Lead Trainer belum ditugaskan',409);
    }
    if(input.status==='ACTIVE'){
      if(participantCount===0)throw new HttpError('Roster participant masih kosong',409);
      if(leadTrainerCount===0)throw new HttpError('Lead Trainer belum ditugaskan',409);
      if(unassignedCount>0)throw new HttpError(unassignedCount+' participant belum memiliki tim',409);
    }

    const updated=await prisma.batch.update({where:{id:batchId},data:{status:input.status}});
    await prisma.auditLog.create({data:{
      actorUserId:actor.id,tenantId:batch.tenantId,batchId,action:'UPDATE',
      resourceType:'Batch',resourceId:batchId,
      metadata:{fromStatus:batch.status,toStatus:input.status},
    }});
    publishBatchEvent(batchId,'BATCH_STATUS',batchId);
    return NextResponse.json({ok:true,status:updated.status});
  }catch(e){return jsonError(e)}
}
