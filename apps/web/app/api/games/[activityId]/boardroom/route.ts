import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

const controlSchema=z.object({command:z.enum(['START','STOP']),caseNo:z.number().int().positive().optional()});

type BoardState={caseNo:number;phase:'RUNNING'|'STOPPED';startedAt:string;remainingAtStop?:number};
type BoardPayload={cases:Array<{no:number;label:string;brief:string}>;timerSec:number};

async function loadBoardroom(activityId:string){
 const activity=await prisma.activity.findUnique({where:{id:activityId},select:{id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true}});
 if(!activity||activity.type!=='BOARDROOM')throw new HttpError('Boardroom activity tidak ditemukan',404);
 const cfg=activity.config as {contentCode?:unknown;timerSec?:unknown};
 const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'BOARDROOM_CASES_V1';
 const content=await prisma.contentItem.findFirst({where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},orderBy:{version:'desc'},select:{code:true,version:true,payload:true}});
 if(!content)throw new HttpError('Konten Boardroom tidak ditemukan',404);
 const payload=content.payload as unknown as BoardPayload;
 if(!Array.isArray(payload.cases)||!payload.cases.length)throw new HttpError('Kasus Boardroom tidak valid',500);
 const timerSec=typeof cfg?.timerSec==='number'?cfg.timerSec:Number(payload.timerSec||60);
 return{activity,content,payload:{...payload,timerSec}};
}
function stateOf(v:Prisma.JsonValue){return v as unknown as BoardState;}
function remaining(state:BoardState,timerSec:number){
 if(state.phase==='STOPPED')return Math.max(0,Number(state.remainingAtStop??0));
 const elapsed=Math.floor((Date.now()-new Date(state.startedAt).getTime())/1000);
 return Math.max(0,timerSec-elapsed);
}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const {activity,content,payload}=await loadBoardroom(activityId);
  const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,isActive:true}});
  const canControl=user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER';
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!round)return NextResponse.json({activity:{id:activity.id,title:activity.title,status:activity.status},content:{code:content.code,version:content.version},timerSec:payload.timerSec,round:null,case:null,canControl});
  const state=stateOf(round.state);
  const currentCase=payload.cases.find(c=>c.no===state.caseNo)??null;
  return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},
   content:{code:content.code,version:content.version},
   timerSec:payload.timerSec,
   round:{id:round.id,roundNo:round.roundNo,...state,remainingSec:remaining(state,payload.timerSec),expired:remaining(state,payload.timerSec)===0},
   case:currentCase,
   canControl,
  });
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=controlSchema.parse(await req.json());
  const {activity,payload}=await loadBoardroom(activityId);
  const actor=await assertPermission('GAME_CONFIGURE',{tenantId:activity.tenantId,batchId:activity.batchId});
  if(activity.status!=='OPEN')throw new HttpError('Buka Boardroom dari Trainer Console terlebih dahulu',409);
  const latest=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const current=latest?stateOf(latest.state):null;

  if(input.command==='START'){
   if(latest&&current?.phase==='RUNNING'&&remaining(current,payload.timerSec)>0)throw new HttpError('Timer Boardroom masih berjalan',409);
   const previous=current?.caseNo??0;
   const nextCase=input.caseNo??(previous>=payload.cases.length?1:previous+1);
   if(!payload.cases.some(c=>c.no===nextCase))throw new HttpError('Kasus Boardroom tidak tersedia',400);
   const state:BoardState={caseNo:nextCase,phase:'RUNNING',startedAt:new Date().toISOString()};
   const row=await prisma.gameRound.create({data:{batchId:activity.batchId,activityId,teamId:null,roundNo:(latest?.roundNo??0)+1,state:state as unknown as Prisma.InputJsonValue,openedAt:new Date()}});
   await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'OPEN_ACTIVITY',resourceType:'BoardroomRound',resourceId:row.id,metadata:{caseNo:nextCase,timerSec:payload.timerSec}}});
   return NextResponse.json({ok:true,round:row});
  }

  if(!latest||!current)throw new HttpError('Timer belum dimulai',409);
  if(current.phase==='STOPPED')throw new HttpError('Timer sudah dihentikan',409);
  const left=remaining(current,payload.timerSec);
  const next:BoardState={...current,phase:'STOPPED',remainingAtStop:left};
  const row=await prisma.gameRound.update({where:{id:latest.id},data:{state:next as unknown as Prisma.InputJsonValue,closedAt:new Date()}});
  await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'UPDATE',resourceType:'BoardroomRound',resourceId:latest.id,metadata:{command:'STOP',remainingSec:left}}});
  return NextResponse.json({ok:true,round:row,remainingSec:left});
 }catch(e){return jsonError(e)}
}
