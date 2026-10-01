import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@ltw/db';
import { assertPermission, requireUser } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';
import { publishBatchEvent } from '@/lib/realtime';

const scoreSchema = z.object({
  activityId: z.string().uuid(),
  teamId: z.string().uuid(),
  values: z.record(z.string(), z.number()),
  notes: z.record(z.string(), z.string().max(1000)).optional().default({}),
});

type SpecItem={code:string;name:string;min:number;max:number};

function slug(value:string){
  return value.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');
}

function rubricSpec(code:string,dimensions:unknown):SpecItem[]{
  if(code==='BOARDROOM'){
    const d=dimensions as {criteria?:unknown;scale?:{min?:unknown;max?:unknown}};
    const criteria=Array.isArray(d?.criteria)?d.criteria.map(String):[];
    const min=typeof d?.scale?.min==='number'?d.scale.min:1;
    const max=typeof d?.scale?.max==='number'?d.scale.max:5;
    return criteria.map(name=>({code:slug(name),name,min,max}));
  }
  if(Array.isArray(dimensions)){
    return dimensions.map((x:any)=>({
      code:typeof x.code==='string'?x.code:slug(String(x.name||'')),
      name:String(x.name||x.code||''),
      min:code==='WAR_ROOM'?0:0,
      max:Number(x.max??1),
    }));
  }
  return [];
}

function rubricCodeForActivity(type:string){
  if(type==='WAR_ROOM')return'WAR_ROOM';
  if(type==='BOARDROOM')return'BOARDROOM';
  if(type==='DELEGATION_RELAY')return'DELEGATION_RELAY';
  return null;
}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
 try{
  const {batchId}=await params;
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
  if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
  const user=await requireUser();
  await assertPermission('BATCH_ACTIVITY_READ',{tenantId:batch.tenantId,batchId});
  const membership=await prisma.batchMembership.findUnique({
    where:{batchId_userId:{batchId,userId:user.id}},
    select:{role:true,isActive:true},
  });
  if(user.platformRole!=='SUPER_ADMIN'&&!membership?.isActive)throw new HttpError('Akses batch tidak aktif',403);

  let teams;
  if(user.platformRole==='SUPER_ADMIN'||membership?.role==='LEAD_TRAINER'){
    teams=await prisma.team.findMany({where:{batchId},orderBy:{number:'asc'},select:{id:true,name:true,number:true}});
  }else if(membership?.role==='CO_FACILITATOR'){
    const assignments=await prisma.observerTeamAssignment.findMany({
      where:{batchId,observerUserId:user.id},
      include:{team:{select:{id:true,name:true,number:true}}},
      orderBy:{team:{number:'asc'}},
    });
    teams=assignments.map(a=>a.team);
  }else{
    throw new HttpError('Hanya Lead Trainer atau Observer yang dapat mengisi rubric',403);
  }

  const activities=await prisma.activity.findMany({
    where:{batchId,type:{in:['DELEGATION_RELAY','BOARDROOM','WAR_ROOM']}},
    orderBy:{sequence:'asc'},
    select:{id:true,type:true,title:true,status:true,session:{select:{code:true,title:true}}},
  });
  const codes=[...new Set(activities.map(a=>rubricCodeForActivity(a.type)).filter(Boolean))] as string[];
  const rubrics=await prisma.rubric.findMany({
    where:{tenantId:null,code:{in:codes},version:1,isPublished:true},
    select:{id:true,code:true,name:true,dimensions:true},
  });
  const rubricByCode=new Map(rubrics.map(r=>[r.code,r]));

  const scores=await prisma.rubricScore.findMany({
    where:{observerUserId:user.id,teamId:{in:teams.map(t=>t.id)},activityId:{in:activities.map(a=>a.id)}},
    select:{activityId:true,teamId:true,dimensionCode:true,rawValue:true,note:true,updatedAt:true},
  });

  return NextResponse.json({
    batch,
    teams,
    activities:activities.map(a=>{
      const code=rubricCodeForActivity(a.type)!;
      const r=rubricByCode.get(code);
      return {...a,rubric:r?{id:r.id,code:r.code,name:r.name,spec:rubricSpec(r.code,r.dimensions)}:null};
    }),
    scores:scores.map(s=>({...s,rawValue:Number(s.rawValue)})),
  });
 }catch(e){return jsonError(e)}
}

export async function POST(req:Request,{params}:{params:Promise<{batchId:string}>}){
 try{
  const {batchId}=await params;
  const input=scoreSchema.parse(await req.json());
  const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true}});
  if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
  const actor=await assertPermission('RUBRIC_SCORE',{tenantId:batch.tenantId,batchId,teamId:input.teamId});

  const team=await prisma.team.findUnique({where:{id:input.teamId},select:{id:true,batchId:true}});
  if(!team||team.batchId!==batchId)throw new HttpError('Tim tidak valid',400);
  const activity=await prisma.activity.findUnique({where:{id:input.activityId},select:{id:true,batchId:true,type:true,status:true,title:true}});
  if(!activity||activity.batchId!==batchId)throw new HttpError('Aktivitas tidak valid',400);
  const code=rubricCodeForActivity(activity.type);
  if(!code)throw new HttpError('Aktivitas tidak memiliki observer rubric',400);
  if(!['OPEN','LOCKED','REVEALED'].includes(activity.status))throw new HttpError('Aktivitas belum dibuka atau sudah ditutup',409);

  const rubric=await prisma.rubric.findFirst({where:{tenantId:null,code,version:1,isPublished:true}});
  if(!rubric)throw new HttpError('Rubric belum tersedia',409);
  const spec=rubricSpec(rubric.code,rubric.dimensions);
  if(!spec.length)throw new HttpError('Rubric tidak memiliki dimensi',500);

  for(const item of spec){
    const value=input.values[item.code];
    if(typeof value!=='number'||!Number.isFinite(value)||value<item.min||value>item.max){
      throw new HttpError(`Nilai ${item.name} harus ${item.min}-${item.max}`,400);
    }
  }

  await prisma.$transaction(async tx=>{
    for(const item of spec){
      await tx.rubricScore.upsert({
        where:{activityId_observerUserId_teamId_dimensionCode:{
          activityId:activity.id,observerUserId:actor.id,teamId:team.id,dimensionCode:item.code,
        }},
        create:{
          activityId:activity.id,rubricId:rubric.id,observerUserId:actor.id,teamId:team.id,
          dimensionCode:item.code,rawValue:input.values[item.code],note:input.notes[item.code]||null,
        },
        update:{rawValue:input.values[item.code],note:input.notes[item.code]||null},
      });
    }
    await tx.auditLog.create({data:{
      actorUserId:actor.id,tenantId:batch.tenantId,batchId,action:'CHANGE_SCORE',
      resourceType:'RubricScore',resourceId:activity.id,
      metadata:{activityId:activity.id,activityType:activity.type,teamId:team.id,rubricCode:rubric.code},
    }});
  });

  const total=spec.reduce((sum,item)=>sum+input.values[item.code],0);
  const max=spec.reduce((sum,item)=>sum+item.max,0);
  publishBatchEvent(batchId, 'RUBRIC_SCORE', input.activityId);
  return NextResponse.json({ok:true,total,max,percent:max?total/max*100:0});
 }catch(e){return jsonError(e)}
}
