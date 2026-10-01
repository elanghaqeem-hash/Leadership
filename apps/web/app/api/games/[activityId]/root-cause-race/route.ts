import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

const submissionSchema=z.object({
  problemStatement:z.string().trim().min(5).max(1500),
  whys:z.array(z.string().trim().min(1).max(1000)).length(5),
  rootCause:z.string().trim().min(5).max(2000),
  evidenceNos:z.array(z.number().int().positive()).min(1).max(12),
  countermeasure:z.string().trim().min(5).max(2000),
});
const controlSchema=z.discriminatedUnion('command',[
 z.object({command:z.literal('START'),durationSec:z.number().int().min(60).max(3600)}),
 z.object({command:z.literal('JUDGE'),teamId:z.string().uuid(),verified:z.boolean(),note:z.string().max(1000).optional().default('')}),
 z.object({command:z.literal('CLOSE')}),
]);

type State={phase:'RUNNING'|'CLOSED';startedAt:string;durationSec:number};
type ContentPayload={caseTitle:string;evidence:Array<{no:number;dimension:string;evidence:string}>;framework:{fiveWhys:number;fishboneCategories:string[];issueTree:string}};
type TeamPayload={
 problemStatement:string;whys:string[];rootCause:string;evidenceNos:number[];countermeasure:string;
 completedAt:string;submittedBy:string;verified?:boolean;reviewNote?:string;reviewedBy?:string;
};

async function loadGame(activityId:string){
 const activity=await prisma.activity.findUnique({where:{id:activityId},select:{id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true}});
 if(!activity||activity.type!=='ROOT_CAUSE_RACE')throw new HttpError('Root Cause Race tidak ditemukan',404);
 const cfg=activity.config as {contentCode?:unknown};
 const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'ROOT_CAUSE_RACE_V1';
 const content=await prisma.contentItem.findFirst({where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},orderBy:{version:'desc'},select:{code:true,version:true,payload:true}});
 if(!content)throw new HttpError('Konten Root Cause Race tidak ditemukan',404);
 const payload=content.payload as unknown as ContentPayload;
 if(!Array.isArray(payload.evidence)||payload.evidence.length===0)throw new HttpError('Evidence Root Cause Race tidak valid',500);
 return{activity,content,payload};
}
function stateOf(v:Prisma.JsonValue){return v as unknown as State;}
function elapsedSec(startedAt:string,completedAt:string){return Math.max(0,Math.floor((new Date(completedAt).getTime()-new Date(startedAt).getTime())/1000));}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const {activity,content,payload}=await loadGame(activityId);
  const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,teamId:true,isActive:true}});
  const isTrainer=user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER';
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const state=round?stateOf(round.state):null;
  const teamId=membership?.teamId??null;
  const own=teamId?await prisma.submission.findUnique({where:{submissionKey:`rootcause:${activityId}:${teamId}`},select:{payload:true,version:true,updatedAt:true}}):null;

  let teams:null|Array<any>=null;
  if(isTrainer&&state){
   const allTeams=await prisma.team.findMany({where:{batchId:activity.batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}});
   const subs=await prisma.submission.findMany({where:{activityId,ownerType:'TEAM',submissionKey:{startsWith:`rootcause:${activityId}:`}},select:{teamId:true,payload:true,updatedAt:true}});
   teams=allTeams.map(team=>{
    const row=subs.find(s=>s.teamId===team.id);
    const answer=row?.payload as unknown as TeamPayload|undefined;
    return{team,answer:answer??null,elapsedSec:answer?.completedAt?elapsedSec(state.startedAt,answer.completedAt):null};
   });
  }
  const verified=teams?.filter(x=>x.answer?.verified===true).sort((a,b)=>(a.elapsedSec??999999)-(b.elapsedSec??999999)||a.team.number-b.team.number).map((x,i)=>({...x,rank:i+1}))??null;
  return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},
   content:{code:content.code,version:content.version},
   caseTitle:payload.caseTitle,evidence:payload.evidence,framework:payload.framework,
   round:round&&state?{id:round.id,roundNo:round.roundNo,...state}:null,
   teamId,answer:own?.payload??null,teams,verifiedLeaderboard:verified,canControl:isTrainer,
  });
 }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=submissionSchema.parse(await req.json());
  const {activity,payload}=await loadGame(activityId);
  if(activity.status!=='OPEN')throw new HttpError('Root Cause Race belum dibuka atau sudah dikunci',409);
  const user=await requireUser();
  await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,teamId:true,isActive:true}});
  if(!membership?.isActive||membership.role!=='PARTICIPANT'||!membership.teamId)throw new HttpError('Participant belum memiliki tim aktif',403);
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!round)throw new HttpError('Root Cause Race belum dimulai',409);
  const state=stateOf(round.state);
  if(state.phase!=='RUNNING')throw new HttpError('Root Cause Race sudah ditutup',409);
  const now=new Date();
  if(now.getTime()>new Date(state.startedAt).getTime()+state.durationSec*1000)throw new HttpError('Waktu Root Cause Race sudah habis',409);
  const validEvidence=new Set(payload.evidence.map(e=>e.no));
  if(input.evidenceNos.some(no=>!validEvidence.has(no)))throw new HttpError('Evidence reference tidak valid',400);

  const submissionKey=`rootcause:${activityId}:${membership.teamId}`;
  const old=await prisma.submission.findUnique({where:{submissionKey},select:{payload:true}});
  const oldPayload=old?.payload as unknown as TeamPayload|undefined;
  const data:TeamPayload={...input,completedAt:oldPayload?.completedAt??now.toISOString(),submittedBy:user.id};
  const saved=await prisma.submission.upsert({
   where:{submissionKey},
   create:{tenantId:activity.tenantId,batchId:activity.batchId,activityId,ownerType:'TEAM',teamId:membership.teamId,userId:user.id,submissionKey,payload:data as unknown as Prisma.InputJsonValue,submittedAt:now},
   update:{userId:user.id,payload:data as unknown as Prisma.InputJsonValue,submittedAt:now,version:{increment:1}},
  });
  return NextResponse.json({ok:true,version:saved.version,completedAt:data.completedAt});
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=controlSchema.parse(await req.json());
  const {activity}=await loadGame(activityId);
  const actor=await assertPermission('GAME_CONFIGURE',{tenantId:activity.tenantId,batchId:activity.batchId});
  if(activity.status!=='OPEN')throw new HttpError('Buka Root Cause Race dari Trainer Console terlebih dahulu',409);
  const latest=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const current=latest?stateOf(latest.state):null;

  if(input.command==='START'){
   if(latest&&current?.phase!=='CLOSED')throw new HttpError('Root Cause Race masih berjalan',409);
   const state:State={phase:'RUNNING',startedAt:new Date().toISOString(),durationSec:input.durationSec};
   const row=await prisma.gameRound.create({data:{batchId:activity.batchId,activityId,teamId:null,roundNo:(latest?.roundNo??0)+1,state:state as unknown as Prisma.InputJsonValue,openedAt:new Date()}});
   await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'OPEN_ACTIVITY',resourceType:'RootCauseRaceRound',resourceId:row.id,metadata:{durationSec:input.durationSec}}});
   return NextResponse.json({ok:true,round:row});
  }

  if(!latest||!current)throw new HttpError('Root Cause Race belum dimulai',409);

  if(input.command==='JUDGE'){
   const team=await prisma.team.findUnique({where:{id:input.teamId},select:{id:true,batchId:true}});
   if(!team||team.batchId!==activity.batchId)throw new HttpError('Tim tidak valid',400);
   const submissionKey=`rootcause:${activityId}:${team.id}`;
   const row=await prisma.submission.findUnique({where:{submissionKey}});
   if(!row)throw new HttpError('Tim belum mengirim analisis',409);
   const answer=row.payload as unknown as TeamPayload;
   const next={...answer,verified:input.verified,reviewNote:input.note,reviewedBy:actor.id};
   await prisma.submission.update({where:{id:row.id},data:{payload:next as unknown as Prisma.InputJsonValue}});
   await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'CHANGE_SCORE',resourceType:'RootCauseRace',resourceId:row.id,metadata:{teamId:team.id,verified:input.verified}}});
   return NextResponse.json({ok:true});
  }

  if(current.phase==='CLOSED')throw new HttpError('Root Cause Race sudah ditutup',409);
  const next:State={...current,phase:'CLOSED'};
  const row=await prisma.gameRound.update({where:{id:latest.id},data:{state:next as unknown as Prisma.InputJsonValue,closedAt:new Date()}});
  return NextResponse.json({ok:true,round:row});
 }catch(e){return jsonError(e)}
}
