import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { rankWarRoomTotals, scoreWarRoom } from '@ltw/scoring';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const columns=['Priority','Decision','Delegation','Escalation','Communication','Action'] as const;
const boardSchema=z.object({
  columns:z.object({
    Priority:z.array(z.string().trim().min(1).max(1000)).max(20),
    Decision:z.array(z.string().trim().min(1).max(1000)).max(20),
    Delegation:z.array(z.string().trim().min(1).max(1000)).max(20),
    Escalation:z.array(z.string().trim().min(1).max(1000)).max(20),
    Communication:z.array(z.string().trim().min(1).max(1000)).max(20),
    Action:z.array(z.string().trim().min(1).max(1000)).max(20),
  }),
});
const controlSchema=z.object({command:z.enum(['START','SEND_EVENT','CLOSE']),eventNo:z.number().int().min(1).max(7).optional()});

type WarState={phase:'RUNNING'|'CLOSED';sentEventNos:number[];startedAt:string};
type Scenario={initialConditions:Array<{no:number;condition:string}>;events:Array<{no:number;event:string}>;boardColumns:string[]};
type Key={events:Array<{no:number;observerFocus:string}>};
type Dim={name:string;max:number};

function slug(value:string){return value.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}

async function loadWarRoom(activityId:string){
 const activity=await prisma.activity.findUnique({
  where:{id:activityId},
  select:{id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true},
 });
 if(!activity||activity.type!=='WAR_ROOM')throw new HttpError('War Room tidak ditemukan',404);
 const cfg=activity.config as {contentCode?:unknown};
 const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'WAR_ROOM_SCENARIO_V1';
 const content=await prisma.contentItem.findFirst({
  where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},
  orderBy:{version:'desc'},select:{code:true,version:true,payload:true,answerKey:true},
 });
 if(!content)throw new HttpError('Skenario War Room tidak ditemukan',404);
 const scenario=content.payload as unknown as Scenario;
 const key=content.answerKey as unknown as Key|null;
 if(!Array.isArray(scenario.initialConditions)||!Array.isArray(scenario.events)||!Array.isArray(scenario.boardColumns))throw new HttpError('Skenario War Room tidak valid',500);
 return {activity,content,scenario,key};
}

function stateOf(value:Prisma.JsonValue){return value as unknown as WarState;}

async function warLeaderboard(activityId:string,batchId:string){
 const rubric=await prisma.rubric.findFirst({where:{tenantId:null,code:'WAR_ROOM',version:1,isPublished:true},select:{id:true,dimensions:true}});
 const teams=await prisma.team.findMany({where:{batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}});
 if(!rubric)return teams.map((team,index)=>({team,total:0,weakestDimension:null,weakestPercent:null,rank:index+1,scoredDimensions:0}));
 const dims=(rubric.dimensions as unknown as Dim[]).map(d=>({code:slug(d.name),name:d.name,max:Number(d.max)}));
 const scores=await prisma.rubricScore.findMany({where:{activityId,rubricId:rubric.id},select:{teamId:true,dimensionCode:true,rawValue:true}});
 const results=teams.map(team=>{
  const values=dims.map(dim=>{
   const rows=scores.filter(s=>s.teamId===team.id&&s.dimensionCode===dim.code);
   const average=rows.length?rows.reduce((sum,r)=>sum+Number(r.rawValue),0)/rows.length:0;
   return{code:dim.code,max:dim.max,score:average};
  });
  const result=scoreWarRoom(values);
  return{team,...result,scoredDimensions:dims.filter(dim=>scores.some(s=>s.teamId===team.id&&s.dimensionCode===dim.code)).length};
 });
 const ranks=rankWarRoomTotals(results.map(r=>r.total));
 return results.map((r,i)=>({...r,rank:ranks[i]})).sort((a,b)=>a.rank-b.rank||a.team.number-b.team.number);
}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const {activity,content,scenario,key}=await loadWarRoom(activityId);
  const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
  const membership=await prisma.batchMembership.findUnique({
   where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
   select:{role:true,teamId:true,isActive:true},
  });
  const canObserve=user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER'||membership?.role==='CO_FACILITATOR';
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const state=round?stateOf(round.state):null;
  const sentEvents=(state?.sentEventNos??[]).map(no=>scenario.events.find(e=>e.no===no)).filter(Boolean);
  const observerFocus=canObserve&&key?Object.fromEntries(key.events.filter(e=>state?.sentEventNos.includes(e.no)).map(e=>[e.no,e.observerFocus])):null;

  const teamId=membership?.teamId??null;
  const board=teamId?await prisma.submission.findUnique({
    where:{submissionKey:`warroom:${activityId}:${teamId}`},
    select:{payload:true,version:true,updatedAt:true,userId:true},
  }):null;
  const teamBoards=canObserve?await prisma.submission.findMany({
    where:{activityId,ownerType:'TEAM',submissionKey:{startsWith:`warroom:${activityId}:`}},
    select:{teamId:true,payload:true,version:true,updatedAt:true},
  }):null;
  const leaderboard=canObserve||state?.phase==='CLOSED'?await warLeaderboard(activityId,activity.batchId):null;

  return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},
   content:{code:content.code,version:content.version},
   initialConditions:scenario.initialConditions,
   boardColumns:columns,
   round:round&&state?{id:round.id,roundNo:round.roundNo,...state}:null,
   events:sentEvents,
   observerFocus,
   teamId,
   board:board?{...board,payload:board.payload}:null,
   teamBoards,
   leaderboard,
   canControl:user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER',
  });
 }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=boardSchema.parse(await req.json());
  const {activity}=await loadWarRoom(activityId);
  if(activity.status!=='OPEN')throw new HttpError('War Room belum dibuka atau sudah dikunci',409);
  const user=await requireUser();
  await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
  const membership=await prisma.batchMembership.findUnique({
    where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
    select:{role:true,teamId:true,isActive:true},
  });
  if(!membership?.isActive||membership.role!=='PARTICIPANT'||!membership.teamId)throw new HttpError('Participant belum memiliki tim aktif',403);
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!round||stateOf(round.state).phase!=='RUNNING')throw new HttpError('War Room belum dimulai atau sudah selesai',409);

  const submissionKey=`warroom:${activityId}:${membership.teamId}`;
  const payload={columns:input.columns,updatedBy:user.id};
  const saved=await prisma.submission.upsert({
   where:{submissionKey},
   create:{
    tenantId:activity.tenantId,batchId:activity.batchId,activityId,ownerType:'TEAM',
    teamId:membership.teamId,userId:user.id,submissionKey,payload:payload as Prisma.InputJsonValue,submittedAt:new Date(),
   },
   update:{userId:user.id,payload:payload as Prisma.InputJsonValue,submittedAt:new Date(),version:{increment:1}},
  });
  publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,version:saved.version,updatedAt:saved.updatedAt});
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=controlSchema.parse(await req.json());
  const {activity,scenario}=await loadWarRoom(activityId);
  const actor=await assertPermission('GAME_CONFIGURE',{tenantId:activity.tenantId,batchId:activity.batchId});
  if(activity.status!=='OPEN')throw new HttpError('Buka aktivitas War Room dari Trainer Console terlebih dahulu',409);
  const latest=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const current=latest?stateOf(latest.state):null;

  if(input.command==='START'){
   if(latest&&current?.phase!=='CLOSED')throw new HttpError('War Room masih berjalan',409);
   const state:WarState={phase:'RUNNING',sentEventNos:[],startedAt:new Date().toISOString()};
   const row=await prisma.gameRound.create({data:{
    batchId:activity.batchId,activityId,teamId:null,roundNo:(latest?.roundNo??0)+1,state:state as unknown as Prisma.InputJsonValue,openedAt:new Date(),
   }});
   await prisma.auditLog.create({data:{
    actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'OPEN_ACTIVITY',
    resourceType:'WarRoomRound',resourceId:row.id,metadata:{roundNo:row.roundNo},
   }});
   publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:row});
  }

  if(!latest||!current)throw new HttpError('War Room belum dimulai',409);
  if(current.phase==='CLOSED')throw new HttpError('War Room sudah ditutup',409);

  if(input.command==='SEND_EVENT'){
   const nextDefault=current.sentEventNos.length?Math.max(...current.sentEventNos)+1:1;
   const eventNo=input.eventNo??nextDefault;
   if(!scenario.events.some(e=>e.no===eventNo))throw new HttpError('Event War Room tidak tersedia',400);
   if(current.sentEventNos.includes(eventNo))throw new HttpError('Event sudah pernah dikirim',409);
   const next:WarState={...current,sentEventNos:[...current.sentEventNos,eventNo]};
   const row=await prisma.gameRound.update({where:{id:latest.id},data:{state:next as unknown as Prisma.InputJsonValue}});
   await prisma.auditLog.create({data:{
    actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'SEND_EVENT',
    resourceType:'WarRoomRound',resourceId:latest.id,metadata:{eventNo},
   }});
   publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:row});
  }

  const next:WarState={...current,phase:'CLOSED'};
  const row=await prisma.gameRound.update({where:{id:latest.id},data:{state:next as unknown as Prisma.InputJsonValue,closedAt:new Date()}});
  await prisma.auditLog.create({data:{
   actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'UPDATE',
   resourceType:'WarRoomRound',resourceId:latest.id,metadata:{command:'CLOSE'},
  }});
  publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:row});
 }catch(e){return jsonError(e)}
}
