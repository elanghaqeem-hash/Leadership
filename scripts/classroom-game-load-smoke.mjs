import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma=new PrismaClient();
const base=process.env.APP_URL||'http://127.0.0.1:3000';
const participants=30;
const thresholdMs=Number(process.env.CLASSROOM_GAME_P95_THRESHOLD_MS||2500);
const suffix=crypto.randomUUID().slice(0,8);
const userIds=[];
let tenantId;

const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const percentile=(values,p)=>{
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
};

async function makeSession(userId){
  const token=crypto.randomBytes(32).toString('base64url');
  await prisma.authSession.create({data:{userId,tokenHash:hash(token),expiresAt:new Date(Date.now()+60*60*1000)}});
  return `${process.env.SESSION_COOKIE_NAME||'ltw_session'}=${token}`;
}

async function request(cookie,path,init={}){
  const started=performance.now();
  const response=await fetch(base+path,{...init,headers:{...(init.headers||{}),cookie}});
  const elapsed=performance.now()-started;
  const text=await response.text();
  return{status:response.status,elapsed,text,headers:response.headers};
}

async function runConcurrent(name,clients,fn){
  const results=await Promise.all(clients.map((client,i)=>fn(client,i)));
  const failed=results.filter(x=>x.status!==200);
  if(failed.length)throw new Error(`${name} failed ${failed.length}/${results.length}: ${failed[0]?.status} ${failed[0]?.text}`);
  const latencies=results.map(x=>x.elapsed);
  const p95=percentile(latencies,0.95);
  if(p95>=thresholdMs)throw new Error(`${name} p95 ${p95.toFixed(1)}ms exceeds ${thresholdMs}ms`);
  return{name,p50Ms:Number(percentile(latencies,0.50).toFixed(1)),p95Ms:Number(p95.toFixed(1)),maxMs:Number(Math.max(...latencies).toFixed(1))};
}

async function patchTrainer(cookie,activityId,slug,body){
  const r=await request(cookie,`/api/games/${activityId}/${slug}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  if(r.status!==200)throw new Error(`trainer ${slug} failed: ${r.status} ${r.text}`);
}

try{
  const version=await prisma.programVersion.findFirst({where:{program:{code:'LTW',isTemplate:true},status:'PUBLISHED'},orderBy:{version:'desc'}});
  if(!version)throw new Error('Published LTW version required');

  const tenant=await prisma.tenant.create({data:{name:'CI Game Load '+suffix,slug:'ci-game-load-'+suffix}});
  tenantId=tenant.id;
  const batch=await prisma.batch.create({data:{
    tenantId:tenant.id,programVersionId:version.id,code:'GAME-'+suffix,name:'CI 30 Participant Game Load',
    joinCode:String(100000+Math.floor(Math.random()*900000)),startDate:new Date(),endDate:new Date(Date.now()+86400000),
    status:'ACTIVE',teamCount:4,participantTarget:participants,
  }});
  const teams=[];
  for(let i=1;i<=4;i++)teams.push(await prisma.team.create({data:{tenantId:tenant.id,batchId:batch.id,name:'Team '+i,number:i}}));

  const trainer=await prisma.user.create({data:{email:`ci-game-trainer-${suffix}@example.local`,name:'CI Lead Trainer',isActive:true,emailVerifiedAt:new Date()}});
  userIds.push(trainer.id);
  await prisma.batchMembership.create({data:{batchId:batch.id,userId:trainer.id,role:'LEAD_TRAINER'}});
  const trainerCookie=await makeSession(trainer.id);

  const clients=[];
  for(let i=0;i<participants;i++){
    const user=await prisma.user.create({data:{email:`ci-game-${suffix}-${i}@example.local`,name:'CI Game Participant '+(i+1),isActive:true,emailVerifiedAt:new Date()}});
    userIds.push(user.id);
    await prisma.batchMembership.create({data:{batchId:batch.id,userId:user.id,role:'PARTICIPANT',teamId:teams[i%teams.length].id}});
    clients.push({cookie:await makeSession(user.id),teamId:teams[i%teams.length].id});
  }

  const specs=[
    ['ARENA','CI Arena',{contentCode:'ARENA_EVENTS_V1'}],
    ['WAR_ROOM','CI War Room',{contentCode:'WAR_ROOM_SCENARIO_V1',rubricCode:'WAR_ROOM'}],
    ['CALENDAR_TETRIS','CI G4 Calendar Tetris',{contentCode:'CALENDAR_TETRIS_V1',game:'G4'}],
    ['DETECTIVE_ROOM','CI G7 Detective Room',{contentCode:'DETECTIVE_ROOM_V1',game:'G7'}],
    ['DECISION_AUCTION','CI G10 Decision Auction',{contentCode:'DECISION_AUCTION_V1',game:'G10'}],
    ['BOARDROOM','CI G11 Boardroom',{contentCode:'BOARDROOM_CASES_V1',rubricCode:'BOARDROOM',timerSec:60,game:'G11'}],
  ];
  const activities={};
  let sequence=1;
  for(const [type,title,config] of specs){
    activities[type]=await prisma.activity.create({data:{tenantId:tenant.id,batchId:batch.id,type,title,sequence:sequence++,status:'OPEN',config,openedAt:new Date()}});
  }

  const warm=await fetch(base+'/api/health');
  if(!warm.ok)throw new Error('health check failed');

  const metrics=[];

  await patchTrainer(trainerCookie,activities.ARENA.id,'arena',{command:'START',eventNo:1});
  metrics.push(await runConcurrent('Arena team decisions',clients,(client,i)=>request(client.cookie,`/api/games/${activities.ARENA.id}/arena`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision:['Do','Delegate','Escalate','Defer'][i%4]}),
  })));

  await patchTrainer(trainerCookie,activities.WAR_ROOM.id,'war-room',{command:'START'});
  const board={columns:{Priority:['P1'],Decision:['D1'],Delegation:['DG1'],Escalation:['E1'],Communication:['C1'],Action:['A1']}};
  metrics.push(await runConcurrent('War Room board saves',clients,client=>request(client.cookie,`/api/games/${activities.WAR_ROOM.id}/war-room`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(board),
  })));

  await patchTrainer(trainerCookie,activities.CALENDAR_TETRIS.id,'calendar-tetris',{command:'START'});
  const calendarGet=await request(clients[0].cookie,`/api/games/${activities.CALENDAR_TETRIS.id}/calendar-tetris`);
  if(calendarGet.status!==200)throw new Error('Calendar setup read failed');
  const calendar=JSON.parse(calendarGet.text);
  const cardId=calendar.cards?.[0]?.id;
  if(!cardId)throw new Error('Calendar card missing');
  metrics.push(await runConcurrent('G4 Calendar saves',clients,(client,i)=>request(client.cookie,`/api/games/${activities.CALENDAR_TETRIS.id}/calendar-tetris`,{
    method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({placements:[{cardId,day:['Senin','Selasa','Rabu','Kamis','Jumat'][i%5],startTime:'08:00',note:'CI'}]}),
  })));

  await patchTrainer(trainerCookie,activities.DETECTIVE_ROOM.id,'detective-room',{command:'START',tokenBudget:10,evidenceCost:2});
  metrics.push(await runConcurrent('G7 Detective evidence buys',clients,client=>request(client.cookie,`/api/games/${activities.DETECTIVE_ROOM.id}/detective-room`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'BUY',evidenceNo:1}),
  })));

  await patchTrainer(trainerCookie,activities.DECISION_AUCTION.id,'decision-auction',{command:'START'});
  metrics.push(await runConcurrent('G10 Auction selections',clients,client=>request(client.cookie,`/api/games/${activities.DECISION_AUCTION.id}/decision-auction`,{
    method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({activeProgramIds:['training']}),
  })));

  await patchTrainer(trainerCookie,activities.BOARDROOM.id,'boardroom',{command:'START',caseNo:1});
  metrics.push(await runConcurrent('G11 Boardroom reads',clients,client=>request(client.cookie,`/api/games/${activities.BOARDROOM.id}/boardroom`)));

  metrics.push(await runConcurrent('Cross-game leaderboard reads',clients,client=>request(client.cookie,`/api/batches/${batch.id}/leaderboard`)));

  const realtime=await Promise.all(clients.map(async client=>{
    const controller=new AbortController();
    const started=performance.now();
    const timer=setTimeout(()=>controller.abort(),5000);
    try{
      const response=await fetch(base+`/api/realtime/batches/${batch.id}`,{headers:{cookie:client.cookie},signal:controller.signal});
      if(!response.ok)return{status:response.status,elapsed:performance.now()-started,text:await response.text()};
      const reader=response.body?.getReader();
      const chunk=reader?await reader.read():{value:null};
      const text=chunk.value?new TextDecoder().decode(chunk.value):'';
      controller.abort();
      return{status:text.includes('event: ready')?200:500,elapsed:performance.now()-started,text};
    }catch(e){
      return{status:500,elapsed:performance.now()-started,text:e instanceof Error?e.message:String(e)};
    }finally{clearTimeout(timer);}
  }));
  const rtFail=realtime.filter(x=>x.status!==200);
  if(rtFail.length)throw new Error(`Realtime subscription failed ${rtFail.length}/${participants}: ${rtFail[0]?.text}`);
  const rtP95=percentile(realtime.map(x=>x.elapsed),0.95);
  if(rtP95>=thresholdMs)throw new Error(`Realtime subscribe p95 ${rtP95.toFixed(1)}ms exceeds ${thresholdMs}ms`);
  metrics.push({name:'Realtime subscriptions',p50Ms:Number(percentile(realtime.map(x=>x.elapsed),0.5).toFixed(1)),p95Ms:Number(rtP95.toFixed(1)),maxMs:Number(Math.max(...realtime.map(x=>x.elapsed)).toFixed(1))});

  const teamCounts={
    arena:await prisma.submission.count({where:{activityId:activities.ARENA.id,ownerType:'TEAM'}}),
    warRoom:await prisma.submission.count({where:{activityId:activities.WAR_ROOM.id,ownerType:'TEAM'}}),
    calendar:await prisma.submission.count({where:{activityId:activities.CALENDAR_TETRIS.id,ownerType:'TEAM'}}),
    detective:await prisma.submission.count({where:{activityId:activities.DETECTIVE_ROOM.id,ownerType:'TEAM'}}),
    auction:await prisma.submission.count({where:{activityId:activities.DECISION_AUCTION.id,ownerType:'TEAM'}}),
  };
  for(const [key,count] of Object.entries(teamCounts))if(count!==4)throw new Error(`${key} expected 4 team records, found ${count}`);

  console.log(JSON.stringify({ok:true,participants,teams:4,thresholdMs,teamCounts,metrics},null,2));
}finally{
  if(tenantId)await prisma.tenant.delete({where:{id:tenantId}}).catch(()=>undefined);
  if(userIds.length)await prisma.user.deleteMany({where:{id:{in:userIds}}}).catch(()=>undefined);
  await prisma.$disconnect();
}
