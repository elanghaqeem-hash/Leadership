import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const days=['Senin','Selasa','Rabu','Kamis','Jumat'] as const;
const scheduleSchema=z.object({
  placements:z.array(z.object({
    cardId:z.string().min(1).max(20),
    day:z.enum(days),
    startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    note:z.string().max(500).optional().default(''),
  })).min(1).max(20),
});
const controlSchema=z.object({command:z.enum(['START','SEND_DISRUPTION','CLOSE']),disruptionNo:z.number().int().positive().optional()});

type State={phase:'PLANNING'|'CLOSED';sentDisruptions:number[];startedAt:string};
type Payload={cards:Array<{id:string;kind:string;card:string}>};
type Key={disruptions:Array<{no:number;label:string;event:string}>};

async function loadGame(activityId:string){
 const activity=await prisma.activity.findUnique({where:{id:activityId},select:{id:true,tenantId:true,batchId:true,type:true,title:true,status:true,config:true}});
 if(!activity||activity.type!=='CALENDAR_TETRIS')throw new HttpError('Calendar Tetris tidak ditemukan',404);
 const cfg=activity.config as {contentCode?:unknown};
 const code=typeof cfg?.contentCode==='string'?cfg.contentCode:'CALENDAR_TETRIS_V1';
 const content=await prisma.contentItem.findFirst({where:{code,isPublished:true,OR:[{tenantId:null},{tenantId:activity.tenantId}]},orderBy:{version:'desc'},select:{code:true,version:true,payload:true,answerKey:true}});
 if(!content)throw new HttpError('Konten Calendar Tetris tidak ditemukan',404);
 const payload=content.payload as unknown as Payload;
 const key=content.answerKey as unknown as Key|null;
 if(!Array.isArray(payload.cards)||!Array.isArray(key?.disruptions))throw new HttpError('Konfigurasi Calendar Tetris tidak valid',500);
 return{activity,content,payload,key:key!};
}
function stateOf(v:Prisma.JsonValue){return v as unknown as State;}

export async function GET(_req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const {activity,content,payload,key}=await loadGame(activityId);
  const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:activity.tenantId,batchId:activity.batchId});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,teamId:true,isActive:true}});
  const isTrainer=user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER';
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const state=round?stateOf(round.state):null;
  const disruptions=(state?.sentDisruptions??[]).map(no=>key.disruptions.find(d=>d.no===no)).filter(Boolean);
  const teamId=membership?.teamId??null;
  const own=teamId?await prisma.submission.findUnique({where:{submissionKey:`calendar:${activityId}:${teamId}`},select:{payload:true,version:true,updatedAt:true}}):null;
  const teamSchedules=isTrainer?await prisma.submission.findMany({where:{activityId,ownerType:'TEAM',submissionKey:{startsWith:`calendar:${activityId}:`}},select:{teamId:true,payload:true,version:true,updatedAt:true}}):null;
  const teams=isTrainer?await prisma.team.findMany({where:{batchId:activity.batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}}):[];
  const readiness=isTrainer?teams.map(team=>({team,submitted:teamSchedules?.some(s=>s.teamId===team.id)??false})):null;
  return NextResponse.json({
   activity:{id:activity.id,title:activity.title,status:activity.status},content:{code:content.code,version:content.version},
   cards:payload.cards,round:round&&state?{id:round.id,roundNo:round.roundNo,...state}:null,
   disruptions,teamId,schedule:own?own.payload:null,readiness,teamSchedules,canControl:isTrainer,
  });
 }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=scheduleSchema.parse(await req.json());
  const {activity,payload}=await loadGame(activityId);
  if(activity.status!=='OPEN')throw new HttpError('Calendar Tetris belum dibuka atau sudah dikunci',409);
  const user=await requireUser();
  await assertPermission('OWN_SUBMISSION_WRITE',{tenantId:activity.tenantId,batchId:activity.batchId,resourceUserId:user.id});
  const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId:activity.batchId,userId:user.id}},select:{role:true,teamId:true,isActive:true}});
  if(!membership?.isActive||membership.role!=='PARTICIPANT'||!membership.teamId)throw new HttpError('Participant belum memiliki tim aktif',403);
  const round=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  if(!round||stateOf(round.state).phase!=='PLANNING')throw new HttpError('Calendar Tetris belum dimulai atau sudah ditutup',409);
  const validIds=new Set(payload.cards.map(c=>c.id));
  if(input.placements.some(p=>!validIds.has(p.cardId)))throw new HttpError('Kartu jadwal tidak valid',400);
  if(new Set(input.placements.map(p=>p.cardId)).size!==input.placements.length)throw new HttpError('Satu kartu hanya boleh ditempatkan sekali',400);
  const submissionKey=`calendar:${activityId}:${membership.teamId}`;
  const data={placements:input.placements,updatedBy:user.id};
  const saved=await prisma.submission.upsert({
   where:{submissionKey},
   create:{tenantId:activity.tenantId,batchId:activity.batchId,activityId,ownerType:'TEAM',teamId:membership.teamId,userId:user.id,submissionKey,payload:data as Prisma.InputJsonValue,submittedAt:new Date()},
   update:{userId:user.id,payload:data as Prisma.InputJsonValue,submittedAt:new Date(),version:{increment:1}},
  });
  publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,version:saved.version});
 }catch(e){return jsonError(e)}
}

export async function PATCH(req:Request,{params}:{params:Promise<{activityId:string}>}){
 try{
  const {activityId}=await params;
  const input=controlSchema.parse(await req.json());
  const {activity,key}=await loadGame(activityId);
  const actor=await assertPermission('GAME_CONFIGURE',{tenantId:activity.tenantId,batchId:activity.batchId});
  if(activity.status!=='OPEN')throw new HttpError('Buka Calendar Tetris dari Trainer Console terlebih dahulu',409);
  const latest=await prisma.gameRound.findFirst({where:{activityId,teamId:null},orderBy:{roundNo:'desc'}});
  const current=latest?stateOf(latest.state):null;
  if(input.command==='START'){
   if(latest&&current?.phase!=='CLOSED')throw new HttpError('Calendar Tetris masih berjalan',409);
   const state:State={phase:'PLANNING',sentDisruptions:[],startedAt:new Date().toISOString()};
   const row=await prisma.gameRound.create({data:{batchId:activity.batchId,activityId,teamId:null,roundNo:(latest?.roundNo??0)+1,state:state as unknown as Prisma.InputJsonValue,openedAt:new Date()}});
   await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'OPEN_ACTIVITY',resourceType:'CalendarTetrisRound',resourceId:row.id,metadata:{roundNo:row.roundNo}}});
   publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:row});
  }
  if(!latest||!current)throw new HttpError('Calendar Tetris belum dimulai',409);
  if(current.phase==='CLOSED')throw new HttpError('Calendar Tetris sudah ditutup',409);
  if(input.command==='SEND_DISRUPTION'){
   const nextDefault=current.sentDisruptions.length?Math.max(...current.sentDisruptions)+1:1;
   const no=input.disruptionNo??nextDefault;
   if(!key.disruptions.some(d=>d.no===no))throw new HttpError('Kartu disrupsi tidak tersedia',400);
   if(current.sentDisruptions.includes(no))throw new HttpError('Kartu disrupsi sudah dikirim',409);
   const next:State={...current,sentDisruptions:[...current.sentDisruptions,no]};
   const row=await prisma.gameRound.update({where:{id:latest.id},data:{state:next as unknown as Prisma.InputJsonValue}});
   await prisma.auditLog.create({data:{actorUserId:actor.id,tenantId:activity.tenantId,batchId:activity.batchId,action:'SEND_EVENT',resourceType:'CalendarTetrisRound',resourceId:latest.id,metadata:{disruptionNo:no}}});
   publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:row});
  }
  const next:State={...current,phase:'CLOSED'};
  const row=await prisma.gameRound.update({where:{id:latest.id},data:{state:next as unknown as Prisma.InputJsonValue,closedAt:new Date()}});
  publishBatchEvent(activity.batchId, 'GAME_STATE', activity.id);
  return NextResponse.json({ok:true,round:row});
 }catch(e){return jsonError(e)}
}
