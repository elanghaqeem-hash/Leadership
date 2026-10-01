import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { scoreDetectiveRoom } from '@ltw/scoring';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const participantSchema=z.discriminatedUnion('action',[
 z.object({action:z.literal('BUY'),evidenceNo:z.number().int().min(1).max(12)}),
 z.object({action:z.literal('DIAGNOSIS'),diagnosis:z.string().trim().min(5).max(3000)}),
]);
const controlSchema=z.discriminatedUnion('command',[
 z.object({command:z.literal('START'),tokenBudget:z.number().int().min(1).max(50),evidenceCost:z.number().int().min(1).max(20)}),
 z.object({command:z.literal('JUDGE'),teamId:z.string().uuid(),correct:z.boolean()}),
 z.object({command:z.literal('CLOSE')}),
]);

type DetectiveState={phase:'RUNNING'|'CLOSED';tokenBudget:number;evidenceCost:number;startedAt:string};
type PublicCard={no:number;topic:string};
type KeyCard={no:number;evidence:string;category:string};
type Payload={cards:PublicCard[]};
type Key={cards:KeyCard[];diagnosisKey:string;scoring:{diagnosisCorrect:number;relevantEvidence:number;remainingToken:number}};
type TeamState={purchased:number[];diagnosis:string;diagnosisCorrect?:boolean;judgedBy?:string|null};

async function loadGame(activityId:string){
 const activity=await prisma.activity.findUnique({where:{id:activityId},select:{id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true}});
 if(!activity||activity.type!=='DETECTIVE_ROOM')throw new HttpError('Detective Room tidak ditemukan',404);
 const cfg=activity.config as {contentCode?:unknown};
 const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'DETECTIVE_ROOM_V1';
 const content=await prisma.contentItem.findFirst({where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},orderBy:{version:'desc'},select:{code:true,version:true,payload:true,answerKey:true}});
 if(!content)throw new HttpError('Konten Detective Room tidak ditemukan',404);
 const payload=content.payload as unknown as Payload;
 const key=content.answerKey as unknown as Key|null;
 if(!Array.isArray(payload.cards)||!Array.isArray(key?.cards))throw new HttpError('Konfigurasi Detective Room tidak valid',500);
 return{activity,content,payload,key:key!};
}
function stateOf(v:Prisma.JsonValue){return v as unknown as DetectiveState;}
function teamState(v:Prisma.JsonValue|undefined|null):TeamState{
 const raw=(v??{}) as any;
 return{purchased:Array.isArray(raw.purchased)?raw.purchased.map(Number):[],diagnosis:typeof raw.diagnosis==='string'?raw.diagnosis:'',diagnosisCorrect:typeof raw.diagnosisCorrect==='boolean'?raw.diagnosisCorrect:undefined,judgedBy:typeof raw.judgedBy==='string'?raw.judgedBy:null};
}
function calculate(state:DetectiveState,ts:TeamState,key:Key){
 const relevant=ts.purchased.filter(no=>{
   const card=key.cards.find(c=>c.no===no);
   return card&&card.category.toLowerCase()!=='pengecoh';
 }).length;
 const remaining=Math.max(0,state.tokenBudget-ts.purchased.length*state.evidenceCost);
 const score=typeof ts.diagnosisCorrect==='boolean'?scoreDetectiveRoom(ts.diagnosisCorrect,relevant,remaining):null;
 return{relevantEvidenceCount:relevant,remainingTokens:remaining,score};
}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const {activity,content,payload,key}=await loadGame(activityId);
  const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,teamId:true,isActive:true}});
  const isTrainer=user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER';
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!round)return NextResponse.json({activity:{id:activity.id,title:activity.title,status:activity.status},round:null,cards:payload.cards,teamId:membership?.teamId??null,canControl:isTrainer});
  const state=stateOf(round.state);
  const teamId=membership?.teamId??null;
  const own=teamId?await prisma.submission.findUnique({where:{submissionKey:`detective:${activityId}:${teamId}`},select:{payload:true,score:true,scoreDetail:true,version:true,updatedAt:true}}):null;
  const ownState=teamState(own?.payload);
  const purchasedEvidence=ownState.purchased.map(no=>{
    const pub=payload.cards.find(c=>c.no===no);
    const secret=key.cards.find(c=>c.no===no);
    return pub&&secret?{no,topic:pub.topic,evidence:secret.evidence}:null;
  }).filter(Boolean);
  const ownCalc=teamId?calculate(state,ownState,key):null;

  let teams:null|Array<any>=null;
  if(isTrainer){
   const teamRows=await prisma.team.findMany({where:{batchId:activity.batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}});
   const submissions=await prisma.submission.findMany({where:{activityId,ownerType:'TEAM',submissionKey:{startsWith:`detective:${activityId}:`}},select:{teamId:true,payload:true}});
   teams=teamRows.map(team=>{
     const row=submissions.find(s=>s.teamId===team.id);
     const ts=teamState(row?.payload);
     return{team,state:ts,...calculate(state,ts,key)};
   }).sort((a,b)=>(b.score?.total??-1)-(a.score?.total??-1)||a.team.number-b.team.number).map((x,i)=>({...x,rank:typeof x.state.diagnosisCorrect==='boolean'?i+1:null}));
  }

  return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},
   content:{code:content.code,version:content.version},
   round:{id:round.id,roundNo:round.roundNo,...state},
   cards:payload.cards,
   teamId,
   purchasedEvidence,
   teamState:teamId?ownState:null,
   teamStatus:ownCalc,
   diagnosisKey:state.phase==='CLOSED'||isTrainer?key.diagnosisKey:null,
   teams,
   canControl:isTrainer,
  });
 }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=participantSchema.parse(await req.json());
  const {activity,key}=await loadGame(activityId);
  if(activity.status!=='OPEN')throw new HttpError('Detective Room belum dibuka atau sudah dikunci',409);
  const user=await requireUser();
  await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,teamId:true,isActive:true}});
  if(!membership?.isActive||membership.role!=='PARTICIPANT'||!membership.teamId)throw new HttpError('Participant belum memiliki tim aktif',403);
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!round)throw new HttpError('Detective Room belum dimulai',409);
  const state=stateOf(round.state);
  if(state.phase!=='RUNNING')throw new HttpError('Detective Room sudah ditutup',409);
  const submissionKey=`detective:${activityId}:${membership.teamId}`;
  const existing=await prisma.submission.findUnique({where:{submissionKey},select:{payload:true}});
  const current=teamState(existing?.payload);

  if(input.action==='BUY'){
    if(!key.cards.some(c=>c.no===input.evidenceNo))throw new HttpError('Evidence card tidak tersedia',400);
    if(!current.purchased.includes(input.evidenceNo)){
      const remaining=state.tokenBudget-current.purchased.length*state.evidenceCost;
      if(remaining<state.evidenceCost)throw new HttpError('Token tim tidak cukup',409);
      current.purchased=[...current.purchased,input.evidenceNo];
    }
  }else{
    current.diagnosis=input.diagnosis;
    current.diagnosisCorrect=undefined;
    current.judgedBy=null;
  }

  const saved=await prisma.submission.upsert({
   where:{submissionKey},
   create:{tenantId:activity.tenantId,batchId:activity.batchId,activityId,ownerType:'TEAM',teamId:membership.teamId,userId:user.id,submissionKey,payload:current as unknown as Prisma.InputJsonValue,submittedAt:new Date()},
   update:{userId:user.id,payload:current as unknown as Prisma.InputJsonValue,submittedAt:new Date(),version:{increment:1},score:null,scoreDetail:Prisma.DbNull},
  });
  publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,version:saved.version,...calculate(state,current,key)});
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=controlSchema.parse(await req.json());
  const {activity,key}=await loadGame(activityId);
  const actor=await assertPermission('GAME_CONFIGURE',{tenantId:activity.tenantId,batchId:activity.batchId});
  if(activity.status!=='OPEN')throw new HttpError('Buka Detective Room dari Trainer Console terlebih dahulu',409);
  const latest=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const current=latest?stateOf(latest.state):null;

  if(input.command==='START'){
   if(latest&&current?.phase!=='CLOSED')throw new HttpError('Detective Room masih berjalan',409);
   const state:DetectiveState={phase:'RUNNING',tokenBudget:input.tokenBudget,evidenceCost:input.evidenceCost,startedAt:new Date().toISOString()};
   const row=await prisma.gameRound.create({data:{batchId:activity.batchId,activityId,teamId:null,roundNo:(latest?.roundNo??0)+1,state:state as unknown as Prisma.InputJsonValue,openedAt:new Date()}});
   await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'OPEN_ACTIVITY',resourceType:'DetectiveRoomRound',resourceId:row.id,metadata:{tokenBudget:input.tokenBudget,evidenceCost:input.evidenceCost}}});
   publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:row});
  }

  if(!latest||!current)throw new HttpError('Detective Room belum dimulai',409);

  if(input.command==='JUDGE'){
   const team=await prisma.team.findUnique({where:{id:input.teamId},select:{id:true,batchId:true}});
   if(!team||team.batchId!==activity.batchId)throw new HttpError('Tim tidak valid',400);
   const submissionKey=`detective:${activityId}:${team.id}`;
   const row=await prisma.submission.findUnique({where:{submissionKey}});
   if(!row)throw new HttpError('Tim belum membuat diagnosis',409);
   const ts=teamState(row.payload);
   if(!ts.diagnosis.trim())throw new HttpError('Tim belum mengirim diagnosis',409);
   ts.diagnosisCorrect=input.correct;ts.judgedBy=actor.id;
   const result=calculate(current,ts,key);
   await prisma.submission.update({where:{id:row.id},data:{payload:ts as unknown as Prisma.InputJsonValue,score:result.score?.total??null,scoreDetail:result as unknown as Prisma.InputJsonValue}});
   await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'CHANGE_SCORE',resourceType:'DetectiveRoom',resourceId:row.id,metadata:{teamId:team.id,diagnosisCorrect:input.correct}}});
   publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,...result});
  }

  if(current.phase==='CLOSED')throw new HttpError('Detective Room sudah ditutup',409);
  const next:DetectiveState={...current,phase:'CLOSED'};
  const row=await prisma.gameRound.update({where:{id:latest.id},data:{state:next as unknown as Prisma.InputJsonValue,closedAt:new Date()}});
  publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:row});
 }catch(e){return jsonError(e)}
}
