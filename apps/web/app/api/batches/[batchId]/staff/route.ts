import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission, hashToken } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { sendAccountNotification } from '@/lib/notifications';

const roleSchema = z.enum(['LEAD_TRAINER','CO_FACILITATOR','SPONSOR_VIEWER']);
const createSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
  name: z.string().trim().min(2).max(200),
  role: roleSchema,
});

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
    if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
    await assertPermission('BATCH_MANAGE',{tenantId:batch.tenantId,batchId});
    const staff=await prisma.batchMembership.findMany({
      where:{batchId,role:{in:['PROGRAM_ADMIN','LEAD_TRAINER','CO_FACILITATOR','SPONSOR_VIEWER']}},
      include:{user:{select:{id:true,email:true,name:true,emailVerifiedAt:true,mfaEnabled:true,isActive:true}}},
      orderBy:[{role:'asc'},{joinedAt:'asc'}],
    });
    return NextResponse.json({staff});
  }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const input=createSchema.parse(await req.json());
    const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
    if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
    const actor=await assertPermission('BATCH_MANAGE',{tenantId:batch.tenantId,batchId});
    let activationLink:string|undefined;
    let activationExpiresAt:Date|undefined;

    const staff=await prisma.$transaction(async(tx)=>{
      let user=await tx.user.findUnique({where:{email:input.email}});
      if(!user)user=await tx.user.create({data:{email:input.email,name:input.name}});
      else if(user.name!==input.name)user=await tx.user.update({where:{id:user.id},data:{name:input.name}});

      await tx.tenantMembership.upsert({
        where:{tenantId_userId:{tenantId:batch.tenantId,userId:user.id}},
        create:{tenantId:batch.tenantId,userId:user.id,role:'MEMBER',displayName:input.name,invitedAt:new Date()},
        update:{displayName:input.name,invitedAt:new Date()},
      });

      const existing=await tx.batchMembership.findUnique({where:{batchId_userId:{batchId,userId:user.id}}});
      if(existing && ['PARTICIPANT','LINE_MANAGER'].includes(existing.role)){
        throw new HttpError(`User ${input.email} sudah memiliki role ${existing.role} pada batch ini`,409);
      }
      const membership=await tx.batchMembership.upsert({
        where:{batchId_userId:{batchId,userId:user.id}},
        create:{batchId,userId:user.id,role:input.role},
        update:{role:input.role,isActive:true},
        include:{user:{select:{id:true,email:true,name:true,emailVerifiedAt:true,mfaEnabled:true,isActive:true}}},
      });

      if(!user.passwordHash || !user.emailVerifiedAt){
        await tx.magicLinkToken.deleteMany({where:{userId:user.id,purpose:'ACCOUNT_ACTIVATION',consumedAt:null}});
        const token=randomBytes(32).toString('base64url');
        activationExpiresAt=new Date(Date.now()+24*60*60*1000);
        await tx.magicLinkToken.create({
          data:{userId:user.id,purpose:'ACCOUNT_ACTIVATION',tokenHash:hashToken(token),expiresAt:activationExpiresAt},
        });
        activationLink=`${process.env.APP_URL||'http://localhost:3000'}/activate?token=${encodeURIComponent(token)}`;
      }

      await tx.auditLog.create({
        data:{
          actorUserId:actor.id,tenantId:batch.tenantId,batchId,
          action:existing?'UPDATE':'CREATE',
          resourceType:'BatchMembership',resourceId:membership.id,
          metadata:{role:input.role,email:input.email},
        },
      });
      return membership;
    });

    if(activationLink&&activationExpiresAt){
      await sendAccountNotification({
        event:'ACCOUNT_ACTIVATION',
        recipient:{userId:staff.user.id,name:staff.user.name,email:staff.user.email,role:staff.role},
        link:activationLink,
        expiresAt:activationExpiresAt.toISOString(),
        batch:{id:batchId,code:batch.code,name:batch.name},
      });
    }
    return NextResponse.json({staff, ...(process.env.NODE_ENV!=='production'&&activationLink?{devActivationLink:activationLink}:{})},{status:201});
  }catch(e){return jsonError(e)}
}
