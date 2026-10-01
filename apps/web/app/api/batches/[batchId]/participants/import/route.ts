import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { parseParticipantCsv } from '@ltw/imports';
import { assertPermission, hashToken } from '@/lib/auth';
import { jsonError } from '@/lib/http';

const MAX_CSV_BYTES=2*1024*1024;

export async function POST(req:Request,{params}:{params:Promise<{batchId:string}>}){
 try{
  const {batchId}=await params;
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,status:true}});
  if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
  const actor=await assertPermission('BATCH_MANAGE',{tenantId:batch.tenantId,batchId});
  const form=await req.formData(); const file=form.get('file');
  if(!(file instanceof File))return NextResponse.json({error:'File CSV wajib diunggah'},{status:400});
  if(file.size>MAX_CSV_BYTES)return NextResponse.json({error:'Ukuran CSV maksimal 2 MB'},{status:413});
  if(!file.name.toLowerCase().endsWith('.csv'))return NextResponse.json({error:'Format file harus .csv'},{status:415});
  const parsed=parseParticipantCsv(await file.text());
  const job=await prisma.participantImportJob.create({data:{tenantId:batch.tenantId,batchId,createdById:actor.id,fileName:file.name,status:'PROCESSING',totalRows:parsed.rows.length+parsed.errors.length,failedRows:parsed.errors.length,errors:parsed.errors}});
  const warnings:Array<{rowNumber:number;email?:string;message:string}>=[];
  const invitationLinks:Array<{rowNumber:number;email:string;link:string}>=[];
  let success=0;
  for(const row of parsed.rows){
   try{
    await prisma.$transaction(async tx=>{
      let participant=await tx.user.findUnique({where:{email:row.email}});
      if(!participant)participant=await tx.user.create({data:{email:row.email,name:row.nama,emailVerifiedAt:null}});
      await tx.tenantMembership.upsert({
        where:{tenantId_userId:{tenantId:batch.tenantId,userId:participant.id}},
        create:{tenantId:batch.tenantId,userId:participant.id,role:'MEMBER',displayName:row.nama,employeeNo:row.nip,unit:row.unit,title:row.jabatan,invitedAt:new Date()},
        update:{displayName:row.nama,employeeNo:row.nip,unit:row.unit,title:row.jabatan,invitedAt:new Date()},
      });
      const existingParticipantBatchRole=await tx.batchMembership.findUnique({where:{batchId_userId:{batchId,userId:participant.id}}});
      if(existingParticipantBatchRole&&existingParticipantBatchRole.role!=='PARTICIPANT') throw new Error(`Peserta ${row.email} sudah memiliki role ${existingParticipantBatchRole.role} pada batch ini`);
      await tx.batchMembership.upsert({
        where:{batchId_userId:{batchId,userId:participant.id}},
        create:{batchId,userId:participant.id,role:'PARTICIPANT'},
        update:{isActive:true},
      });

      if(!participant.passwordHash||!participant.emailVerifiedAt){
        await tx.magicLinkToken.deleteMany({where:{userId:participant.id,purpose:'ACCOUNT_ACTIVATION',consumedAt:null}});
        const activationToken=randomBytes(32).toString('base64url');
        await tx.magicLinkToken.create({data:{userId:participant.id,purpose:'ACCOUNT_ACTIVATION',tokenHash:hashToken(activationToken),expiresAt:new Date(Date.now()+24*60*60*1000)}});
        if(process.env.NODE_ENV!=='production') invitationLinks.push({rowNumber:row.rowNumber,email:row.email,link:`${process.env.APP_URL||'http://localhost:3000'}/activate?token=${encodeURIComponent(activationToken)}`});
      }

      if(row.managerEmail){
        let manager=await tx.user.findUnique({where:{email:row.managerEmail}});
        if(!manager)manager=await tx.user.create({data:{email:row.managerEmail,name:row.atasan||row.managerEmail}});
        await tx.tenantMembership.upsert({where:{tenantId_userId:{tenantId:batch.tenantId,userId:manager.id}},create:{tenantId:batch.tenantId,userId:manager.id,role:'MEMBER',displayName:row.atasan,invitedAt:new Date()},update:{displayName:row.atasan||undefined,invitedAt:new Date()}});
        const existingManagerBatchRole=await tx.batchMembership.findUnique({where:{batchId_userId:{batchId,userId:manager.id}}});
        if(existingManagerBatchRole&&existingManagerBatchRole.role!=='LINE_MANAGER') throw new Error(`Atasan ${row.managerEmail} sudah memiliki role ${existingManagerBatchRole.role} pada batch ini`);
        await tx.batchMembership.upsert({where:{batchId_userId:{batchId,userId:manager.id}},create:{batchId,userId:manager.id,role:'LINE_MANAGER'},update:{role:'LINE_MANAGER',isActive:true}});
        await tx.participantManagerLink.upsert({where:{batchId_participantUserId:{batchId,participantUserId:participant.id}},create:{batchId,participantUserId:participant.id,managerUserId:manager.id},update:{managerUserId:manager.id}});
      }else if(row.atasan){
        warnings.push({rowNumber:row.rowNumber,email:row.email,message:`Atasan "${row.atasan}" belum dipetakan karena atasan_email tidak tersedia.`});
      }
    });
    success++;
   }catch(error){parsed.errors.push({rowNumber:row.rowNumber,email:row.email,message:error instanceof Error?error.message:'Import row failed'});}
  }
  const failed=parsed.errors.length;
  const status=failed===0?'COMPLETED':success>0?'COMPLETED_WITH_ERRORS':'FAILED';
  await prisma.participantImportJob.update({where:{id:job.id},data:{status,successRows:success,failedRows:failed,errors:parsed.errors,warnings,completedAt:new Date()}});
  await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:batch.tenantId,batchId,action:'CREATE',resourceType:'ParticipantImportJob',resourceId:job.id,metadata:{fileName:file.name,success,failed,warnings:warnings.length}}});
  return NextResponse.json({jobId:job.id,status,total:success+failed,success,failed,errors:parsed.errors,warnings,...(process.env.NODE_ENV!=='production'?{invitationLinks}:{})},{status:failed&&success===0?422:200});
 }catch(e){return jsonError(e)}
}
