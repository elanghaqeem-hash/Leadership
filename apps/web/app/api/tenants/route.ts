import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission, hashToken, requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { tenantCreateSchema } from '@/lib/validation';

export async function GET(){
 try{
  const user=await requireUser();
  if(user.platformRole==='SUPER_ADMIN') return NextResponse.json({tenants:await prisma.tenant.findMany({orderBy:{name:'asc'}})});
  const memberships=await prisma.tenantMembership.findMany({where:{userId:user.id},include:{tenant:true}});
  return NextResponse.json({tenants:memberships.map(x=>x.tenant).sort((a,b)=>a.name.localeCompare(b.name))});
 }catch(e){return jsonError(e)}
}
export async function POST(req:Request){
 try{
  const actor=await assertPermission('TENANT_MANAGE',{});
  const input=tenantCreateSchema.parse(await req.json());
  const result=await prisma.$transaction(async tx=>{
    const tenant=await tx.tenant.create({data:{name:input.name,slug:input.slug,retentionDays:input.retentionDays}});
    let activationToken:string|undefined;
    if(input.programAdminEmail&&input.programAdminName){
      let admin=await tx.user.findUnique({where:{email:input.programAdminEmail}});
      if(!admin) admin=await tx.user.create({data:{email:input.programAdminEmail,name:input.programAdminName}});
      await tx.tenantMembership.upsert({where:{tenantId_userId:{tenantId:tenant.id,userId:admin.id}},create:{tenantId:tenant.id,userId:admin.id,role:'PROGRAM_ADMIN',displayName:input.programAdminName,invitedAt:new Date()},update:{role:'PROGRAM_ADMIN',displayName:input.programAdminName,invitedAt:new Date()}});
      activationToken=randomBytes(32).toString('base64url');
      await tx.magicLinkToken.create({data:{userId:admin.id,purpose:'ACCOUNT_ACTIVATION',tokenHash:hashToken(activationToken),expiresAt:new Date(Date.now()+24*60*60*1000)}});
    }
    await tx.auditLog.create({data:{actorUserId:actor.id,tenantId:tenant.id,action:'CREATE',resourceType:'Tenant',resourceId:tenant.id,metadata:{name:tenant.name,slug:tenant.slug,programAdminEmail:input.programAdminEmail??null}}});
    return {tenant,activationToken};
  });
  const devActivationLink=result.activationToken&&process.env.NODE_ENV!=='production'?`${process.env.APP_URL||'http://localhost:3000'}/activate?token=${encodeURIComponent(result.activationToken)}`:undefined;
  return NextResponse.json({tenant:result.tenant,...(devActivationLink?{devActivationLink}:{})},{status:201});
 }catch(e){return jsonError(e)}
}
