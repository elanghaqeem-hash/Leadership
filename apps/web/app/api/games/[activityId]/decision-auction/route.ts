import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { scoreDecisionAuction, type AuctionProgram, type AuctionRound } from '@ltw/scoring';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

const submitSchema=z.object({activeProgramIds:z.array(z.string().min(1).max(80)).max(7).refine(v=>new Set(v).size===v.length,'Program tidak boleh duplikat')});
const controlSchema=z.object({command:z.enum(['START','CLOSE'])});

type RoundName='R0'|'R1'|'R2'|'R3';
type AuctionState={round:RoundName;phase:'CHOOSING'|'CLOSED';startedAt:string};
type PublicProgram={id:string;name:string;cost:number;benefit:number;risk:number;uncertainty:number};
type AuctionPayload={budget:number;switchingRate:number;maxActive:number;programs:PublicProgram[]};
type AuctionKey={roundInfo:Record<string,string>;factors:Record<string,{r1:number;r2:number;r3:number}>};

const rounds:RoundName[]=['R0','R1','R2','R3'];

async function loadAuction(activityId:string){
 const activity=await prisma.activity.findUnique({where:{id:activityId},select:{id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true}});
 if(!activity||activity.type!=='DECISION_AUCTION')throw new HttpError('Decision Auction tidak ditemukan',404);
 const cfg=activity.config as {contentCode?:unknown};
 const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'DECISION_AUCTION_V1';
 const content=await prisma.contentItem.findFirst({where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},orderBy:{version:'desc'},select:{code:true,version:true,payload:true,answerKey:true}});
 if(!content)throw new HttpError('Konten Decision Auction tidak ditemukan',404);
 const payload=content.payload as unknown as AuctionPayload;
 const key=content.answerKey as unknown as AuctionKey|null;
 if(!Array.isArray(payload.programs)||!key?.factors||!key.roundInfo)throw new HttpError('Konfigurasi Decision Auction tidak valid',500);
 const programs:AuctionProgram[]=payload.programs.map(p=>({...p,factors:key.factors[p.id]}));
 if(programs.some(p=>!p.factors))throw new HttpError('Factor program Decision Auction tidak lengkap',500);
 return{activity,content,payload,key,programs};
}

function stateOf(value:Prisma.JsonValue){return value as unknown as AuctionState;}

async function allTeamRounds(activityId:string,batchId:string){
 const teams=await prisma.team.findMany({where:{batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}});
 const rows=await prisma.submission.findMany({where:{activityId,ownerType:'TEAM',submissionKey:{startsWith:`auction:${activityId}:`}},select:{teamId:true,payload:true}});
 return{teams,rows};
}

function selectionStatus(ids:string[],payload:AuctionPayload){
 const chosen=payload.programs.filter(p=>ids.includes(p.id));
 const cost=chosen.reduce((s,p)=>s+p.cost,0);
 return{cost,count:chosen.length,withinBudget:cost<=payload.budget,withinMax:chosen.length<=payload.maxActive,valid:cost<=payload.budget&&chosen.length<=payload.maxActive};
}

async function leaderboard(activityId:string,batchId:string,programs:AuctionProgram[],payload:AuctionPayload){
 const {teams,rows}=await allTeamRounds(activityId,batchId);
 const result=teams.map(team=>{
   const rr:AuctionRound[]=rounds.map(round=>{
     const row=rows.find(r=>r.teamId===team.id&&(r.payload as any)?.round===round);
     const ids=Array.isArray((row?.payload as any)?.activeProgramIds)?(row!.payload as any).activeProgramIds as string[]:[];
     return{round,activeProgramIds:ids};
   });
   const complete=rr.every(r=>rows.some(x=>x.teamId===team.id&&(x.payload as any)?.round===r.round));
   const score=complete?scoreDecisionAuction(rr,programs,{budget:payload.budget,maxActive:payload.maxActive,switchingRate:payload.switchingRate}):null;
   return{team,complete,score};
 });
 return result.sort((a,b)=>(b.score?.net??-1)-(a.score?.net??-1)||a.team.number-b.team.number).map((x,i)=>({...x,rank:x.complete?i+1:null}));
}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const {activity,content,payload,key,programs}=await loadAuction(activityId);
  const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,teamId:true,isActive:true}});
  const isTrainer=user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER';
  const current=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!current)return NextResponse.json({activity:{id:activity.id,title:activity.title,status:activity.status},round:null,programs:payload.programs,budget:payload.budget,maxActive:payload.maxActive,teamId:membership?.teamId??null,canControl:isTrainer});
  const state=stateOf(current.state);
  const teamId=membership?.teamId??null;
  const my=teamId?await prisma.submission.findUnique({where:{submissionKey:`auction:${activityId}:${state.round}:${teamId}`},select:{payload:true,updatedAt:true}}):null;
  const myIds=Array.isArray((my?.payload as any)?.activeProgramIds)?(my!.payload as any).activeProgramIds as string[]:[];
  const {teams,rows}=isTrainer?await allTeamRounds(activityId,activity.batchId):{teams:[],rows:[]};
  const readiness=isTrainer?teams.map(team=>({team,submitted:rows.some(r=>r.teamId===team.id&&(r.payload as any)?.round===state.round)})):null;
  const finalClosed=state.round==='R3'&&state.phase==='CLOSED';
  const board=(finalClosed||isTrainer)?await leaderboard(activityId,activity.batchId,programs,payload):null;
  return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},
   round:{id:current.id,roundNo:current.roundNo,...state},
   programs:payload.programs,budget:payload.budget,maxActive:payload.maxActive,switchingRate:payload.switchingRate,
   roundInfo:state.round==='R0'?null:key.roundInfo[state.round]??null,
   teamId,mySelection:myIds,myStatus:selectionStatus(myIds,payload),
   readiness,leaderboard:board,canControl:isTrainer,
  });
 }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=submitSchema.parse(await req.json());
  const {activity,payload}=await loadAuction(activityId);
  if(activity.status!=='OPEN')throw new HttpError('Decision Auction belum dibuka atau sudah dikunci',409);
  const user=await requireUser();
  await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,teamId:true,isActive:true}});
  if(!membership?.isActive||membership.role!=='PARTICIPANT'||!membership.teamId)throw new HttpError('Participant belum memiliki tim aktif',403);
  const current=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!current)throw new HttpError('Round belum dimulai trainer',409);
  const state=stateOf(current.state);
  if(state.phase!=='CHOOSING')throw new HttpError('Round sudah ditutup',409);
  const known=new Set(payload.programs.map(p=>p.id));
  if(input.activeProgramIds.some(id=>!known.has(id)))throw new HttpError('Program tidak valid',400);
  const status=selectionStatus(input.activeProgramIds,payload);
  const submissionKey=`auction:${activityId}:${state.round}:${membership.teamId}`;
  const data={round:state.round,activeProgramIds:input.activeProgramIds,submittedBy:user.id,status};
  await prisma.submission.upsert({
   where:{submissionKey},
   create:{tenantId:activity.tenantId,batchId:activity.batchId,activityId,ownerType:'TEAM',teamId:membership.teamId,userId:user.id,submissionKey,payload:data as Prisma.InputJsonValue,submittedAt:new Date()},
   update:{userId:user.id,payload:data as Prisma.InputJsonValue,submittedAt:new Date(),version:{increment:1}},
  });
  return NextResponse.json({ok:true,status});
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=controlSchema.parse(await req.json());
  const {activity}=await loadAuction(activityId);
  const actor=await assertPermission('GAME_CONFIGURE',{tenantId:activity.tenantId,batchId:activity.batchId});
  if(activity.status!=='OPEN')throw new HttpError('Buka Decision Auction dari Trainer Console terlebih dahulu',409);
  const latest=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const current=latest?stateOf(latest.state):null;
  if(input.command==='START'){
    if(latest&&current?.phase!=='CLOSED')throw new HttpError('Tutup round aktif terlebih dahulu',409);
    const nextIndex=current?rounds.indexOf(current.round)+1:0;
    if(nextIndex<0||nextIndex>=rounds.length)throw new HttpError('Seluruh round R0-R3 sudah selesai',409);
    const state:AuctionState={round:rounds[nextIndex],phase:'CHOOSING',startedAt:new Date().toISOString()};
    const row=await prisma.gameRound.create({data:{batchId:activity.batchId,activityId,teamId:null,roundNo:(latest?.roundNo??0)+1,state:state as unknown as Prisma.InputJsonValue,openedAt:new Date()}});
    await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'OPEN_ACTIVITY',resourceType:'AuctionRound',resourceId:row.id,metadata:{round:state.round}}});
    return NextResponse.json({ok:true,round:row});
  }
  if(!latest||!current)throw new HttpError('Belum ada round aktif',409);
  if(current.phase==='CLOSED')throw new HttpError('Round sudah ditutup',409);
  const next:AuctionState={...current,phase:'CLOSED'};
  const row=await prisma.gameRound.update({where:{id:latest.id},data:{state:next as unknown as Prisma.InputJsonValue,closedAt:new Date()}});
  await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'UPDATE',resourceType:'AuctionRound',resourceId:latest.id,metadata:{round:current.round,command:'CLOSE'}}});
  return NextResponse.json({ok:true,round:row});
 }catch(e){return jsonError(e)}
}
