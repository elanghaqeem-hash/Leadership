import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { requireUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { consumeRateLimit, rateLimitHeaders, requestIp } from '@/lib/rate-limit';

const schema=z.object({code:z.string().trim().regex(/^\d{6}$/)});

function destination(role:string,batchId:string){
 if(role==='PARTICIPANT')return '/batch/'+batchId;
 if(role==='LEAD_TRAINER')return '/trainer/batches/'+batchId;
 if(role==='CO_FACILITATOR')return '/observer/batches/'+batchId;
 if(role==='PROGRAM_ADMIN')return '/admin/batches/'+batchId+'/participants';
 return '/dashboard';
}

export async function POST(req:Request){
 try{
  const user=await requireUser();
  const {code}=schema.parse(await req.json());
  const limit=await consumeRateLimit({scope:'CLASS_JOIN',identifier:user.id+'|'+requestIp(req),limit:20,windowMs:5*60_000});
  if(!limit.allowed)return NextResponse.json({error:'Terlalu banyak percobaan kode kelas. Coba lagi nanti.'},{status:429,headers:rateLimitHeaders(limit)});
  const batch=await prisma.batch.findUnique({where:{joinCode:code},select:{id:true,tenantId:true,code:true,name:true,status:true}});
  if(!batch)return NextResponse.json({error:'Kode kelas tidak valid'},{status:404});
  const membership=await prisma.batchMembership.findUnique({
   where:{batchId_userId:{batchId:batch.id,userId:user.id}},
   select:{id:true,role:true,isActive:true,teamId:true},
  });
  if(!membership?.isActive){
    return NextResponse.json({error:'Akun Anda belum terdaftar pada kelas ini. Hubungi Program Admin.'},{status:403});
  }
  await prisma.auditLog.create({data:{
    actorUserId:user.id,tenantId:batch.tenantId,batchId:batch.id,action:'UPDATE',
    resourceType:'BatchMembership',resourceId:membership.id,metadata:{event:'JOIN_BY_CODE'},
  }});
  return NextResponse.json({
    ok:true,batch:{id:batch.id,code:batch.code,name:batch.name,status:batch.status},
    role:membership.role,teamId:membership.teamId,destination:destination(membership.role,batch.id),
  });
 }catch(e){return jsonError(e)}
}
