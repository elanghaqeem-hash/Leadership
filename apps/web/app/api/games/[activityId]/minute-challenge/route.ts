import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

const categories=['Focus','Meeting','Customer','People/Coaching','Admin/Batch','Buffer','Break','Other'];

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const activity=await prisma.activity.findUnique({
   where:{id:activityId},
   select:{id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true},
  });
  if(!activity||activity.type!=='MINUTE_AUDIT')throw new HttpError('480-Minute Challenge tidak ditemukan',404);
  const cfg=activity.config as {mode?:unknown};
  if(cfg?.mode!=='DAY1')throw new HttpError('Aktivitas ini bukan G2 480-Minute Challenge',409);
  await assertPermission('SESSION_CONTROL',{tenantId:activity.tenantId,batchId:activity.batchId});
  const participantCount=await prisma.batchMembership.count({where:{batchId:activity.batchId,role:'PARTICIPANT',isActive:true}});
  const submissions=await prisma.submission.findMany({
   where:{activityId,userId:{not:null}},
   select:{userId:true,payload:true,scoreDetail:true,submittedAt:true},
  });
  const totals=Object.fromEntries(categories.map(k=>[k,0])) as Record<string,number>;
  let exact480=0;
  for(const row of submissions){
   const detail=row.scoreDetail as {totalMinutes?:unknown;byCategory?:Record<string,unknown>}|null;
   if(Number(detail?.totalMinutes)===480)exact480++;
   for(const category of categories)totals[category]+=Number(detail?.byCategory?.[category]??0);
  }
  const denominator=Math.max(1,submissions.length);
  const averages=Object.fromEntries(categories.map(k=>[k,Math.round(totals[k]/denominator)]));
  const ranked=categories.map(category=>({category,averageMinutes:averages[category]})).sort((a,b)=>b.averageMinutes-a.averageMinutes);
  return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},
   participantCount,submittedCount:submissions.length,exact480Count:exact480,
   completionPct:participantCount?submissions.length/participantCount*100:0,
   averageByCategory:averages,
   topTimeCategories:ranked.slice(0,4),
  });
 }catch(e){return jsonError(e)}
}
