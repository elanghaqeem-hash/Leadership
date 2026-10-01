import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { scoreArena, scoreArenaEvent, type ArenaDecision, type ArenaDimension } from '@ltw/scoring';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

const decisionSchema=z.object({decision:z.enum(['Do','Delegate','Escalate','Defer'])});
const controlSchema=z.object({command:z.enum(['START','REVEAL','CLOSE']),eventNo:z.number().int().min(1).max(20).optional()});

type ArenaState={eventNo:number;phase:'VOTING'|'REVEALED'|'CLOSED';startedAt:string};
type PublicEvent={no:number;event:string;dimension:ArenaDimension;doMinutes:number};
type KeyEvent={no:number;best:ArenaDecision;acceptable:ArenaDecision};

async function loadArena(activityId:string){
 const activity=await prisma.activity.findUnique({
  where:{id:activityId},
  select:{id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true},
 });
 if(!activity||activity.type!=='ARENA')throw new HttpError('Arena tidak ditemukan',404);
 const cfg=activity.config as {contentCode?:unknown};
 const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'ARENA_EVENTS_V1';
 const content=await prisma.contentItem.findFirst({
  where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},
  orderBy:{version:'desc'},
  select:{code:true,version:true,payload:true,answerKey:true},
 });
 if(!content)throw new HttpError('Konten Arena tidak ditemukan',404);
 const payload=content.payload as {events?:unknown};
 const key=content.answerKey as {events?:unknown}|null;
 if(!Array.isArray(payload?.events)||!Array.isArray(key?.events))throw new HttpError('Konfigurasi Arena tidak valid',500);
 return {activity,content,events:payload.events as PublicEvent[],keys:key!.events as KeyEvent[]};
}

function stateOf(value:Prisma.JsonValue){return value as unknown as ArenaState;}

async function computeLeaderboard(activityId:string,events:PublicEvent[],keys:KeyEvent[]){
 const teams=await prisma.team.findMany({where:{submissions:{some:{activityId}}},select:{id:true,name:true,number:true}});
 const allTeams=teams.length?teams:await prisma.team.findMany({
  where:{batch:{activities:{some:{id:activityId}}}},select:{id:true,name:true,number:true},orderBy:{number:'asc'}
 });
 const rows=await prisma.submission.findMany({
  where:{activityId,ownerType:'TEAM',submissionKey:{startsWith:`arena:${activityId}:`}},
  select:{teamId:true,payload:true},
 });
 const eventMap=new Map(events.map(e=>[e.no,e]));
 const keyMap=new Map(keys.map(e=>[e.no,e]));
 const scores=allTeams.map(team=>{
  const decisions=rows.filter(r=>r.teamId===team.id).map(r=>r.payload as {eventNo?:number;decision?:ArenaDecision});
  const inputs=decisions.flatMap(d=>{
    if(typeof d.eventNo!=='number'||!d.decision)return[];
    const ev=eventMap.get(d.eventNo),k=keyMap.get(d.eventNo);
    if(!ev||!k)return[];
    return[{dimension:ev.dimension,best:k.best,acceptable:k.acceptable,doMinutes:ev.doMinutes,selected:d.decision}];
  });
  const score=scoreArena(inputs);
  return {team,...score,decisionsCount:inputs.length};
 }).sort((a,b)=>b.total-a.total||a.team.number-b.team.number);
 return scores.map((x,i)=>({...x,rank:i+1}));
}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const {activity,content,events,keys}=await loadArena(activityId);
  const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
  const membership=await prisma.batchMembership.findUnique({
   where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
   select:{role:true,teamId:true,isActive:true},
  });
  const isTrainer=user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER';
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!round)return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},
   content:{code:content.code,version:content.version},
   round:null,event:null,teamId:membership?.teamId??null,canControl:isTrainer,
  });

  const state=stateOf(round.state);
  const event=events.find(e=>e.no===state.eventNo)??null;
  const key=keys.find(e=>e.no===state.eventNo)??null;
  const revealed=state.phase==='REVEALED'||state.phase==='CLOSED';
  const teamId=membership?.teamId??null;
  const myTeamDecision=teamId?await prisma.submission.findUnique({
   where:{submissionKey:`arena:${activityId}:${round.roundNo}:${teamId}`},
   select:{payload:true,submittedAt:true,userId:true},
  }):null;

  let eventResults:null|Array<Record<string,unknown>>=null;
  let leaderboard:null|Awaited<ReturnType<typeof computeLeaderboard>>=null;
  if(revealed||isTrainer){
   const teams=await prisma.team.findMany({where:{batchId:activity.batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}});
   const submissions=await prisma.submission.findMany({
    where:{activityId,submissionKey:{startsWith:`arena:${activityId}:${round.roundNo}:`}},
    select:{teamId:true,payload:true},
   });
   eventResults=teams.map(team=>{
    const row=submissions.find(s=>s.teamId===team.id);
    const payload=row?.payload as {decision?:ArenaDecision}|undefined;
    const result=payload?.decision&&event&&key?scoreArenaEvent({
      dimension:event.dimension,best:key.best,acceptable:key.acceptable,doMinutes:event.doMinutes,selected:payload.decision,
    }):null;
    return {team,decision:payload?.decision??null,result};
   });
   leaderboard=await computeLeaderboard(activityId,events,keys);
  }

  return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},
   round:{id:round.id,roundNo:round.roundNo,eventNo:state.eventNo,phase:state.phase,startedAt:state.startedAt},
   event,
   teamId,
   myTeamDecision:myTeamDecision?(myTeamDecision.payload as {decision?:unknown}).decision??null:null,
   answer:revealed||isTrainer?key:null,
   eventResults,
   leaderboard,
   canControl:isTrainer,
  });
 }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const {decision}=decisionSchema.parse(await req.json());
  const {activity}=await loadArena(activityId);
  if(activity.status!=='OPEN')throw new HttpError('Arena belum dibuka atau sudah dikunci',409);
  const user=await requireUser();
  await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
  const membership=await prisma.batchMembership.findUnique({
   where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},
   select:{role:true,teamId:true,isActive:true},
  });
  if(!membership?.isActive||membership.role!=='PARTICIPANT'||!membership.teamId)throw new HttpError('Participant belum memiliki tim aktif',403);
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!round)throw new HttpError('Event Arena belum dimulai',409);
  const state=stateOf(round.state);
  if(state.phase!=='VOTING')throw new HttpError('Voting event sudah ditutup/reveal',409);

  const submissionKey=`arena:${activityId}:${round.roundNo}:${membership.teamId}`;
  const payload={eventNo:state.eventNo,decision,submittedBy:user.id};
  await prisma.submission.upsert({
   where:{submissionKey},
   create:{
    tenantId:activity.tenantId,batchId:activity.batchId,activityId,ownerType:'TEAM',
    teamId:membership.teamId,userId:user.id,submissionKey,payload:payload as Prisma.InputJsonValue,submittedAt:new Date(),
   },
   update:{userId:user.id,payload:payload as Prisma.InputJsonValue,submittedAt:new Date(),version:{increment:1}},
  });
  return NextResponse.json({ok:true,decision});
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=controlSchema.parse(await req.json());
  const {activity,events}=await loadArena(activityId);
  const actor=await assertPermission('GAME_CONFIGURE',{tenantId:activity.tenantId,batchId:activity.batchId});
  if(activity.status!=='OPEN')throw new HttpError('Buka aktivitas Arena dari Trainer Console terlebih dahulu',409);
  const latest=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const latestState=latest?stateOf(latest.state):null;

  if(input.command==='START'){
   if(latest&&latestState?.phase!=='CLOSED')throw new HttpError('Tutup event aktif sebelum memulai event berikutnya',409);
   const roundNo=(latest?.roundNo??0)+1;
   const previous=latestState?.eventNo??0;
   const eventNo=input.eventNo??(previous>=events.length?1:previous+1);
   if(!events.some(e=>e.no===eventNo))throw new HttpError('Nomor event tidak tersedia',400);
   const state:ArenaState={eventNo,phase:'VOTING',startedAt:new Date().toISOString()};
   const row=await prisma.gameRound.create({data:{
    batchId:activity.batchId,activityId,teamId:null,roundNo,state:state as unknown as Prisma.InputJsonValue,openedAt:new Date(),
   }});
   await prisma.auditLog.create({data:{
    actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'OPEN_ACTIVITY',
    resourceType:'ArenaRound',resourceId:row.id,metadata:{eventNo,roundNo},
   }});
   return NextResponse.json({ok:true,round:row});
  }

  if(!latest||!latestState)throw new HttpError('Belum ada event aktif',409);
  if(input.command==='REVEAL'&&latestState.phase==='CLOSED')throw new HttpError('Event sudah ditutup',409);
  const next:ArenaState={...latestState,phase:input.command==='REVEAL'?'REVEALED':'CLOSED'};
  const row=await prisma.gameRound.update({where:{id:latest.id},data:{
   state:next as unknown as Prisma.InputJsonValue,closedAt:input.command==='CLOSE'?new Date():latest.closedAt,
  }});
  await prisma.auditLog.create({data:{
   actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,
   action:input.command==='REVEAL'?'REVEAL_KEY':'UPDATE',resourceType:'ArenaRound',resourceId:latest.id,
   metadata:{eventNo:latestState.eventNo,roundNo:latest.roundNo,command:input.command},
  }});
  return NextResponse.json({ok:true,round:row});
 }catch(e){return jsonError(e)}
}
