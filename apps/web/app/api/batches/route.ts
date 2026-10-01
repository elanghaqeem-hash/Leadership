import { randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { batchCreateSchema } from '@/lib/validation';
import { jsonError } from '@/lib/http';

async function uniqueJoinCode(){for(let i=0;i<20;i++){const code=String(randomInt(0,1_000_000)).padStart(6,'0');if(!await prisma.batch.findUnique({where:{joinCode:code},select:{id:true}}))return code;}throw new Error('Unable to generate join code');}

export async function GET(req:Request){
 try{
  const user=await requireUser(); const tenantId=new URL(req.url).searchParams.get('tenantId')||undefined;
  if(user.platformRole==='SUPER_ADMIN') return NextResponse.json({batches:await prisma.batch.findMany({where:tenantId?{tenantId}:{},include:{tenant:{select:{name:true,slug:true}},_count:{select:{memberships:true}}},orderBy:{startDate:'desc'}})});
  const adminTenants=await prisma.tenantMembership.findMany({where:{userId:user.id,role:'PROGRAM_ADMIN',...(tenantId?{tenantId}:{})},select:{tenantId:true}});
  const adminTenantIds=adminTenants.map(x=>x.tenantId);
  const direct=await prisma.batchMembership.findMany({where:{userId:user.id,...(tenantId?{batch:{tenantId}}:{})},select:{batchId:true}});
  const directIds=direct.map(x=>x.batchId);
  const batches=await prisma.batch.findMany({where:{OR:[...(adminTenantIds.length?[{tenantId:{in:adminTenantIds}}]:[]),...(directIds.length?[{id:{in:directIds}}]:[])]},include:{tenant:{select:{name:true,slug:true}},_count:{select:{memberships:true}}},orderBy:{startDate:'desc'}});
  return NextResponse.json({batches});
 }catch(e){return jsonError(e)}
}

export async function POST(req:Request){
 try{
  const input=batchCreateSchema.parse(await req.json());
  const actor=await assertPermission('BATCH_MANAGE',{tenantId:input.tenantId});
  let version= input.programVersionId ? await prisma.programVersion.findUnique({where:{id:input.programVersionId},include:{scoringConfig:true,program:true}}) : await prisma.programVersion.findFirst({where:{program:{code:'LTW',isTemplate:true},status:'PUBLISHED'},include:{scoringConfig:true,program:true},orderBy:{version:'desc'}});
  if(!version) return NextResponse.json({error:'Published Leadership That Works program template belum tersedia. Jalankan db:seed.'},{status:409});
  if(version.program.tenantId&&version.program.tenantId!==input.tenantId)return NextResponse.json({error:'Program version bukan milik tenant ini'},{status:403});
  const joinCode=await uniqueJoinCode();
  const batch=await prisma.$transaction(async tx=>{
    const created=await tx.batch.create({data:{tenantId:input.tenantId,programVersionId:version!.id,code:input.code,name:input.name,joinCode,startDate:input.startDate,endDate:input.endDate,location:input.location,teamCount:input.teamCount,participantTarget:input.participantTarget,status:'DRAFT'}});
    if(version!.scoringConfig)await tx.batchScoringConfig.create({data:{batchId:created.id,schemaVersion:version!.scoringConfig.schemaVersion,config:version!.scoringConfig.config,sourceHash:version!.scoringConfig.configHash}});
    await tx.team.createMany({data:Array.from({length:input.teamCount},(_,i)=>({tenantId:input.tenantId,batchId:created.id,name:`Tim ${i+1}`,number:i+1}))});
    const actorTenantMembership=await tx.tenantMembership.findUnique({where:{tenantId_userId:{tenantId:input.tenantId,userId:actor.id}}});
    if(actorTenantMembership?.role==='PROGRAM_ADMIN') await tx.batchMembership.upsert({where:{batchId_userId:{batchId:created.id,userId:actor.id}},create:{batchId:created.id,userId:actor.id,role:'PROGRAM_ADMIN'},update:{role:'PROGRAM_ADMIN',isActive:true}});
    await tx.auditLog.create({data:{actorUserId:actor.id,tenantId:input.tenantId,batchId:created.id,action:'CREATE',resourceType:'Batch',resourceId:created.id,metadata:{code:created.code,joinCode:created.joinCode}}});
    return created;
  });
  return NextResponse.json({batch},{status:201});
 }catch(e){return jsonError(e)}
}
