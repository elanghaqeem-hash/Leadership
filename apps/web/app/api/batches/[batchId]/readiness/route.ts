import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

type Check={code:string;label:string;status:'PASS'|'WARN'|'BLOCK';detail:string};

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},
      select:{
        id:true,tenantId:true,code:true,name:true,status:true,participantTarget:true,teamCount:true,
        programVersion:{select:{id:true,version:true,status:true,contentHash:true}},
      },
    });
    if(!batch)throw new HttpError('Batch tidak ditemukan',404);
    const actor=await assertPermission('TEAM_MANAGE',{tenantId:batch.tenantId,batchId});

    const [members,teams,activities,preTest,tenantRole,batchRole,observerAssignments]=await Promise.all([
      prisma.batchMembership.findMany({
        where:{batchId,isActive:true},
        select:{
          role:true,teamId:true,userId:true,
          user:{select:{isActive:true,emailVerifiedAt:true,passwordHash:true}},
        },
      }),
      prisma.team.findMany({where:{batchId},select:{id:true,number:true,name:true,_count:{select:{members:true}}},orderBy:{number:'asc'}}),
      prisma.activity.findMany({
        where:{batchId},
        select:{id:true,type:true,status:true,config:true,_count:{select:{submissions:true}}},
      }),
      prisma.test.findFirst({where:{tenantId:null,code:'LTW_PRE_POST',version:1},select:{id:true}}),
      prisma.tenantMembership.findUnique({where:{tenantId_userId:{tenantId:batch.tenantId,userId:actor.id}},select:{role:true}}),
      prisma.batchMembership.findUnique({where:{batchId_userId:{batchId,userId:actor.id}},select:{role:true}}),
      prisma.observerTeamAssignment.findMany({where:{batchId},select:{teamId:true,observerUserId:true}}),
    ]);

    const participants=members.filter(m=>m.role==='PARTICIPANT');
    const participantIds=participants.map(x=>x.userId);
    const leadTrainers=members.filter(m=>m.role==='LEAD_TRAINER').length;
    const facilitators=members.filter(m=>m.role==='CO_FACILITATOR').length;
    const assigned=participants.filter(p=>p.teamId).length;
    const activationPending=participants.filter(p=>!p.user.emailVerifiedAt||!p.user.passwordHash||!p.user.isActive).length;
    const observerCoveredTeams=new Set(observerAssignments.map(a=>a.teamId)).size;
    const observersAssigned=new Set(observerAssignments.map(a=>a.observerUserId)).size;
    const managerLinks=participantIds.length?await prisma.participantManagerLink.count({where:{batchId,participantUserId:{in:participantIds}}}):0;

    const preAttemptCount=preTest?await prisma.testAttempt.count({
      where:{batchId,testId:preTest.id,kind:'PRE',userId:{in:participantIds},submittedAt:{not:null}},
    }):0;
    const preDiagnostic=activities.find(a=>a.type==='SELF_DIAGNOSTIC'&&(a.config as any)?.mode==='PRE');
    const preDiagnosticCount=preDiagnostic?await prisma.submission.count({
      where:{batchId,activityId:preDiagnostic.id,userId:{in:participantIds},ownerType:'USER',submittedAt:{not:null}},
    }):0;
    const minutePre=activities.find(a=>a.type==='MINUTE_AUDIT'&&(a.config as any)?.mode==='PRE');
    const minutePreCount=minutePre?await prisma.submission.count({
      where:{batchId,activityId:minutePre.id,userId:{in:participantIds},ownerType:'USER',submittedAt:{not:null}},
    }):0;

    const teamSizes=teams.map(t=>t._count.members);
    const minTeam=teamSizes.length?Math.min(...teamSizes):0;
    const maxTeam=teamSizes.length?Math.max(...teamSizes):0;
    const targetText=batch.participantTarget?' · target '+batch.participantTarget:'';

    const checks:Check[]=[
      {
        code:'PROGRAM_VERSION',label:'Program version published',
        status:batch.programVersion.status==='PUBLISHED'?'PASS':'BLOCK',
        detail:'LTW v'+batch.programVersion.version+' · '+batch.programVersion.status,
      },
      {
        code:'ACTIVITIES',label:'Classroom activities generated',
        status:activities.length>0?'PASS':'BLOCK',
        detail:activities.length+' activity records tersedia',
      },
      {
        code:'PARTICIPANTS',label:'Participant roster',
        status:participants.length>0?'PASS':'BLOCK',
        detail:participants.length+' participant aktif'+targetText,
      },
      {
        code:'TEAM_ASSIGNMENT',label:'All participants assigned to teams',
        status:participants.length>0&&assigned===participants.length?'PASS':'BLOCK',
        detail:assigned+'/'+participants.length+' sudah memiliki tim',
      },
      {
        code:'TEAM_BALANCE',label:'Team balance',
        status:teams.length===batch.teamCount&&maxTeam-minTeam<=1?'PASS':'WARN',
        detail:teams.length+'/'+batch.teamCount+' tim · ukuran min '+minTeam+', max '+maxTeam,
      },
      {
        code:'LEAD_TRAINER',label:'Lead Trainer assigned',
        status:leadTrainers>=1?'PASS':'BLOCK',
        detail:leadTrainers+' Lead Trainer aktif',
      },
      {
        code:'FACILITATOR',label:'Observer / Co-Facilitator availability',
        status:facilitators>=1?'PASS':'WARN',
        detail:facilitators+' Co-Facilitator aktif',
      },
      {
        code:'OBSERVER_ASSIGNMENT',label:'Observer team coverage',
        status:facilitators===0?'WARN':observerCoveredTeams===teams.length&&teams.length>0?'PASS':'WARN',
        detail:observerCoveredTeams+'/'+teams.length+' tim covered · '+observersAssigned+'/'+facilitators+' observer assigned',
      },
      {
        code:'ACTIVATION',label:'Participant account activation',
        status:activationPending===0?'PASS':'WARN',
        detail:activationPending===0?'Semua participant siap login':activationPending+' participant belum fully activated',
      },
      {
        code:'MANAGER_MAPPING',label:'Line Manager mapping',
        status:participants.length>0&&managerLinks===participants.length?'PASS':'WARN',
        detail:managerLinks+'/'+participants.length+' participant memiliki manager mapping',
      },
      {
        code:'PRE_DIAGNOSTIC',label:'Pre Self-Diagnostic completion',
        status:participants.length>0&&preDiagnosticCount===participants.length?'PASS':'WARN',
        detail:preDiagnosticCount+'/'+participants.length+' selesai',
      },
      {
        code:'PRE_MINUTE_AUDIT',label:'480-Minute Audit awal completion',
        status:participants.length>0&&minutePreCount===participants.length?'PASS':'WARN',
        detail:minutePreCount+'/'+participants.length+' selesai',
      },
      {
        code:'PRE_TEST',label:'Pre-Test completion',
        status:participants.length>0&&preAttemptCount===participants.length?'PASS':'WARN',
        detail:preAttemptCount+'/'+participants.length+' selesai',
      },
    ];

    if(batch.participantTarget&&participants.length!==batch.participantTarget){
      checks.push({
        code:'PARTICIPANT_TARGET',label:'Participant target match',status:'WARN',
        detail:'Actual '+participants.length+' vs target '+batch.participantTarget,
      });
    }

    const blocking=checks.filter(c=>c.status==='BLOCK').length;
    const canChangeStatus=actor.platformRole==='SUPER_ADMIN'||tenantRole?.role==='PROGRAM_ADMIN'||batchRole?.role==='PROGRAM_ADMIN';
    const nextStatus=({DRAFT:'PRE_TRAINING',PRE_TRAINING:'ACTIVE',ACTIVE:'FOLLOW_UP',FOLLOW_UP:'CLOSED',CLOSED:'ARCHIVED'} as Record<string,string|undefined>)[batch.status]??null;
    const warnings=checks.filter(c=>c.status==='WARN').length;
    const passed=checks.filter(c=>c.status==='PASS').length;
    return NextResponse.json({
      batch:{id:batch.id,code:batch.code,name:batch.name,status:batch.status},
      summary:{ready:blocking===0,blocking,warnings,passed,total:checks.length},
      lifecycle:{canChangeStatus,nextStatus},
      checks,
      counts:{participants:participants.length,assigned,teams:teams.length,leadTrainers,facilitators,observerCoveredTeams,observersAssigned,managerLinks,activationPending},
    });
  }catch(e){return jsonError(e)}
}
