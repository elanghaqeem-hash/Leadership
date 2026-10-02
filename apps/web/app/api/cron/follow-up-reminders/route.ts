import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { sendReminder } from '@/lib/notifications';

export const dynamic='force-dynamic';

function utcDayRange(date=new Date()){
  const start=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate(),0,0,0,0));
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+1);
  return{start,end};
}

function checkpointDate(plan:{reviewD7:Date;reviewD14:Date;reviewD30:Date},kind:'D7'|'D14'|'D30'){
  return kind==='D7'?plan.reviewD7:kind==='D14'?plan.reviewD14:plan.reviewD30;
}

export async function POST(req:Request){
  const secret=req.headers.get('x-cron-secret');
  if(!process.env.CRON_SECRET||secret!==process.env.CRON_SECRET){
    return NextResponse.json({error:'Unauthorized'},{status:401});
  }

  const{start,end}=utcDayRange();
  const cleanup=await prisma.rateLimitBucket.deleteMany({where:{expiresAt:{lt:new Date()}}});
  const plans=await prisma.thirtyDayPlan.findMany({
    where:{
      status:{in:['ACTIVE','COMPLETED']},
      OR:[
        {reviewD7:{gte:start,lt:end}},
        {reviewD14:{gte:start,lt:end}},
        {reviewD30:{gte:start,lt:end}},
      ],
    },
    include:{
      participant:{select:{id:true,name:true,email:true}},
      manager:{select:{id:true,name:true,email:true}},
      batch:{select:{id:true,code:true,name:true,tenantId:true}},
      followUps:{select:{kind:true,submittedAt:true}},
    },
  });

  const results:Array<Record<string,unknown>>=[];
  for(const plan of plans){
    const checkpoints:Array<'D7'|'D14'|'D30'>=['D7','D14','D30'];
    for(const kind of checkpoints){
      const due=checkpointDate(plan,kind);
      if(due<start||due>=end)continue;
      if(plan.followUps.some(f=>f.kind===kind&&f.submittedAt))continue;

      const recipients=[
        {user:plan.participant,role:'PARTICIPANT' as const,destinationPath:'/batch/'+plan.batch.id},
        ...(kind==='D7'||!plan.manager?[]:[{user:plan.manager,role:'LINE_MANAGER' as const,destinationPath:'/manager/batches/'+plan.batch.id}]),
      ];

      for(const recipient of recipients){
        const resourceId=`${plan.id}:${kind}:${recipient.user.id}`;
        const prior=await prisma.auditLog.findFirst({
          where:{resourceType:'ReminderDelivery',resourceId},
          select:{id:true},
        });
        if(prior){results.push({planId:plan.id,kind,recipient:recipient.user.email,status:'ALREADY_SENT'});continue;}

        const deliveries=await sendReminder({
          event:'FOLLOW_UP_REMINDER',
          checkpoint:kind,
          dueAt:due.toISOString(),
          recipient:{userId:recipient.user.id,name:recipient.user.name,email:recipient.user.email,role:recipient.role},
          participant:{userId:plan.participant.id,name:plan.participant.name,email:plan.participant.email},
          batch:{id:plan.batch.id,code:plan.batch.code,name:plan.batch.name},
          destinationPath:recipient.destinationPath,
        });
        const successful=deliveries.filter(x=>x.ok);
        if(successful.length){
          await prisma.auditLog.create({data:{
            actorUserId:null,tenantId:plan.batch.tenantId,batchId:plan.batch.id,
            action:'UPDATE',resourceType:'ReminderDelivery',resourceId,
            metadata:{kind,recipientUserId:recipient.user.id,channels:successful.map(x=>x.channel),dueAt:due.toISOString()},
          }});
          results.push({planId:plan.id,kind,recipient:recipient.user.email,status:'SENT',channels:successful.map(x=>x.channel)});
        }else{
          results.push({planId:plan.id,kind,recipient:recipient.user.email,status:'NO_DELIVERY',deliveries});
        }
      }
    }
  }

  return NextResponse.json({
    ok:true,
    date:start.toISOString().slice(0,10),
    plansChecked:plans.length,
    deliveries:results,
    rateLimitBucketsDeleted:cleanup.count,
  });
}
