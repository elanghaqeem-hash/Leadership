import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

const querySchema=z.object({
  page:z.coerce.number().int().min(1).default(1),
  pageSize:z.coerce.number().int().min(10).max(100).default(50),
  action:z.string().trim().max(50).optional(),
  resourceType:z.string().trim().max(120).optional(),
  actor:z.string().trim().max(200).optional(),
  from:z.string().datetime().optional(),
  to:z.string().datetime().optional(),
});

export async function GET(req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true},
    });
    if(!batch)throw new HttpError('Batch tidak ditemukan',404);
    await assertPermission('AUDIT_READ',{tenantId:batch.tenantId,batchId});

    const url=new URL(req.url);
    const input=querySchema.parse({
      page:url.searchParams.get('page')||undefined,
      pageSize:url.searchParams.get('pageSize')||undefined,
      action:url.searchParams.get('action')||undefined,
      resourceType:url.searchParams.get('resourceType')||undefined,
      actor:url.searchParams.get('actor')||undefined,
      from:url.searchParams.get('from')||undefined,
      to:url.searchParams.get('to')||undefined,
    });

    const where:any={batchId};
    if(input.action)where.action=input.action;
    if(input.resourceType)where.resourceType={contains:input.resourceType,mode:'insensitive'};
    if(input.actor){
      where.actor={OR:[
        {name:{contains:input.actor,mode:'insensitive'}},
        {email:{contains:input.actor,mode:'insensitive'}},
      ]};
    }
    if(input.from||input.to)where.createdAt={
      ...(input.from?{gte:new Date(input.from)}:{}),
      ...(input.to?{lte:new Date(input.to)}:{}),
    };

    const [total,rows,actions,resourceTypes]=await Promise.all([
      prisma.auditLog.count({where}),
      prisma.auditLog.findMany({
        where,
        include:{actor:{select:{id:true,name:true,email:true}}},
        orderBy:{createdAt:'desc'},
        skip:(input.page-1)*input.pageSize,
        take:input.pageSize,
      }),
      prisma.auditLog.findMany({where:{batchId},distinct:['action'],select:{action:true},orderBy:{action:'asc'}}),
      prisma.auditLog.findMany({where:{batchId},distinct:['resourceType'],select:{resourceType:true},orderBy:{resourceType:'asc'}}),
    ]);

    return NextResponse.json({
      batch,
      pagination:{page:input.page,pageSize:input.pageSize,total,pages:Math.max(1,Math.ceil(total/input.pageSize))},
      filters:{actions:actions.map(x=>x.action),resourceTypes:resourceTypes.map(x=>x.resourceType)},
      rows:rows.map(row=>({
        id:row.id,action:row.action,resourceType:row.resourceType,resourceId:row.resourceId,
        actor:row.actor?{id:row.actor.id,name:row.actor.name,email:row.actor.email}:null,
        metadata:row.metadata,ipHash:row.ipHash,userAgent:row.userAgent,createdAt:row.createdAt,
      })),
    });
  }catch(e){return jsonError(e)}
}
