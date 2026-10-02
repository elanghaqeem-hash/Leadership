import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import { prisma } from '@ltw/db';
import { assertPermission, getCurrentUser } from '@/lib/auth';
import { jsonError } from '@/lib/http';

const sheetNames=[
  'Petunjuk','1 Self-Diagnostic','2 480-Minute','3 Priority Scorecard','4 Weekly Planner',
  '5 Big3 & Meeting','6 Delegation','7 GROW & SBI','8 Fact-Assumption','9 Root Cause',
  '10 Bias Checklist','11 Decision Matrix','12 Pre-Mortem','13 Decision Log','14 Action Tracker',
  '15 Arena Scoring','16 Decision Auction','17 War Room Score','18 Boardroom Rubric',
  '19 Pre-Post Test','19b Test Scoring','20 30-Day Plan','21 Manager Follow-up','22 Impact Metrics',
  '23 AAR & SSC','24 Kartu Game','25 Evaluasi Training',
] as const;

const typeSheet:Record<string,string>={
  SELF_DIAGNOSTIC:'1 Self-Diagnostic',
  MINUTE_AUDIT:'2 480-Minute',
  PRIORITY_SCORECARD:'3 Priority Scorecard',
  WEEKLY_PLANNER:'4 Weekly Planner',
  DAILY_BIG_3:'5 Big3 & Meeting',
  MEETING_CHECKLIST:'5 Big3 & Meeting',
  DELEGATION_CONTRACT:'6 Delegation',
  RACI_BUILDER:'6 Delegation',
  DELEGATION_RELAY:'6 Delegation',
  GROW_COACHING:'7 GROW & SBI',
  SBI_FEEDBACK:'7 GROW & SBI',
  FACT_ASSUMPTION_OPINION_UNKNOWN:'8 Fact-Assumption',
  FIVE_WHYS:'9 Root Cause',
  FISHBONE:'9 Root Cause',
  ISSUE_TREE:'9 Root Cause',
  ROOT_CAUSE_RACE:'9 Root Cause',
  BIAS_CHECKLIST:'10 Bias Checklist',
  BIAS_TRAP:'10 Bias Checklist',
  DECISION_MATRIX:'11 Decision Matrix',
  PRE_MORTEM:'12 Pre-Mortem',
  DECISION_LOG:'13 Decision Log',
  ACTION_TRACKER:'14 Action Tracker',
  ARENA:'15 Arena Scoring',
  DECISION_AUCTION:'16 Decision Auction',
  WAR_ROOM:'17 War Room Score',
  BOARDROOM:'18 Boardroom Rubric',
  PRE_TEST:'19b Test Scoring',
  POST_TEST:'19b Test Scoring',
  THIRTY_DAY_PLAN:'20 30-Day Plan',
  AAR_STOP_START_CONTINUE:'23 AAR & SSC',
  EVALUATION_L1:'25 Evaluasi Training',
};

function safeJson(value:unknown){
  if(value===null||value===undefined)return '';
  try{return JSON.stringify(value);}catch{return String(value);}
}

function styleSheet(ws:ExcelJS.Worksheet){
  ws.views=[{state:'frozen',ySplit:1}];
  ws.getRow(1).font={bold:true,color:{argb:'FFFFFFFF'}};
  ws.getRow(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF10243E'}};
  ws.getRow(1).alignment={vertical:'middle',wrapText:true};
  ws.getRow(1).height=24;
  ws.columns.forEach(col=>{col.width=Math.min(40,Math.max(12,col.width||12));});
  ws.eachRow((row,rowNo)=>{
    if(rowNo>1){
      row.alignment={vertical:'top',wrapText:true};
      if(rowNo%2===0)row.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF7F9FB'}};
    }
  });
}

function writeTable(ws:ExcelJS.Worksheet,headers:string[],rows:unknown[][]){
  ws.addRow(headers);
  for(const row of rows)ws.addRow(row as any[]);
  headers.forEach((h,i)=>{
    let width=Math.max(12,Math.min(36,h.length+3));
    for(const row of rows.slice(0,100)){
      const len=String(row[i]??'').length;
      width=Math.max(width,Math.min(36,len+2));
    }
    ws.getColumn(i+1).width=width;
  });
  styleSheet(ws);
}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},
      select:{id:true,tenantId:true,code:true,name:true,startDate:true,endDate:true,status:true,tenant:{select:{name:true}}},
    });
    if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
    const participantCount=await prisma.batchMembership.count({where:{batchId,role:'PARTICIPANT',isActive:true}});
    const actor=await assertPermission('EXPORT_AGGREGATE',{tenantId:batch.tenantId,batchId,aggregateSize:participantCount});
    const user=await getCurrentUser();
    if(!user||user.id!==actor.id)return NextResponse.json({error:'Unauthorized'},{status:401});
    const [batchMembership,tenantMembership]=await Promise.all([
      prisma.batchMembership.findUnique({where:{batchId_userId:{batchId,userId:user.id}},select:{role:true}}),
      prisma.tenantMembership.findUnique({where:{tenantId_userId:{tenantId:batch.tenantId,userId:user.id}},select:{role:true}}),
    ]);
    const isSponsor=user.platformRole!=='SUPER_ADMIN'&&(batchMembership?.role==='SPONSOR_VIEWER'||tenantMembership?.role==='SPONSOR_VIEWER');
    const canPrivate=user.platformRole!=='SUPER_ADMIN'&&batchMembership?.role==='LEAD_TRAINER';

    const workbook=new ExcelJS.Workbook();
    workbook.creator='Leadership That Works';
    workbook.created=new Date();
    workbook.properties.date1904=false;
    const sheets=new Map<string,ExcelJS.Worksheet>();
    for(const name of sheetNames)sheets.set(name,workbook.addWorksheet(name));

    writeTable(sheets.get('Petunjuk')!,['Field','Value'],[
      ['Export','Leadership That Works — Batch Result Export'],
      ['Bank/Tenant',batch.tenant.name],
      ['Batch',batch.code+' · '+batch.name],
      ['Status',batch.status],
      ['Periode',batch.startDate.toISOString().slice(0,10)+' s.d. '+batch.endDate.toISOString().slice(0,10)],
      ['Participant aktif',participantCount],
      ['Generated at',new Date().toISOString()],
      ['Source structure','27 sheet setara Leadership_That_Works_Toolkit.xlsx'],
      ['Privacy mode',isSponsor?'AGGREGATE ONLY (Sponsor Viewer)':'AUTHORIZED DETAIL'],
    ]);

    const activities=await prisma.activity.findMany({
      where:{batchId},
      select:{id:true,type:true,title:true,config:true,sequence:true,session:{select:{code:true,title:true}}},
      orderBy:{sequence:'asc'},
    });
    const activityById=new Map(activities.map(a=>[a.id,a]));

    if(!isSponsor){
      const submissions=await prisma.submission.findMany({
        where:{batchId},
        include:{
          user:{select:{name:true,email:true}},
          team:{select:{name:true,number:true}},
        },
        orderBy:{createdAt:'asc'},
      });
      const grouped=new Map<string,unknown[][]>();
      for(const s of submissions){
        const a=activityById.get(s.activityId);
        const sheet=a?typeSheet[a.type]:undefined;
        if(!sheet)continue;
        const payload=s.isPrivateReflection&&!canPrivate?'[PRIVATE REFLECTION — excluded]':safeJson(s.payload);
        const row=[
          a?.session?.code||'',a?.title||'',a?.type||'',
          typeof (a?.config as any)?.mode==='string'?(a?.config as any).mode:'',
          s.user?.name||'',s.user?.email||'',s.team?.name||'',
          s.submittedAt?.toISOString()||'',s.score===null?'':Number(s.score),
          payload,s.isPrivateReflection&&!canPrivate?'':safeJson(s.scoreDetail),
        ];
        if(!grouped.has(sheet))grouped.set(sheet,[]);
        grouped.get(sheet)!.push(row);
      }
      const headers=['Session','Activity','Type','Mode','Participant','Email','Team','Submitted At','Score','Payload JSON','Score Detail JSON'];
      for(const [sheet,rows] of grouped)writeTable(sheets.get(sheet)!,headers,rows);

      // Pre/Post test bank without exposing answer keys.
      const test=await prisma.test.findFirst({where:{code:'LTW_PRE_POST',version:1},include:{questions:{orderBy:{sequence:'asc'}}}});
      writeTable(sheets.get('19 Pre-Post Test')!,['No','Code','Question','Options JSON','Points'],(test?.questions||[]).map((q,i)=>[
        i+1,q.code,q.prompt,safeJson(q.options),q.points,
      ]));
      const attempts=await prisma.testAttempt.findMany({
        where:{batchId},
        include:{user:{select:{name:true,email:true}}},
        orderBy:[{kind:'asc'},{submittedAt:'asc'}],
      });
      writeTable(sheets.get('19b Test Scoring')!,['Participant','Email','Kind','Score','Started At','Submitted At','Answers JSON'],attempts.map(a=>[
        a.user.name,a.user.email,a.kind,a.score,a.startedAt.toISOString(),a.submittedAt?.toISOString()||'',safeJson(a.answers),
      ]));

      const plans=await prisma.thirtyDayPlan.findMany({
        where:{batchId},
        include:{participant:{select:{name:true,email:true}},targets:{orderBy:{sequence:'asc'}},followUps:{include:{author:{select:{name:true,email:true}}}}},
      });
      writeTable(sheets.get('20 30-Day Plan')!,['Participant','Email','Start','D7','D14','D30','Status','Target','Behavior','Elements JSON'],plans.flatMap(p=>p.targets.map(t=>[
        p.participant.name,p.participant.email,p.startDate.toISOString().slice(0,10),p.reviewD7.toISOString().slice(0,10),p.reviewD14.toISOString().slice(0,10),p.reviewD30.toISOString().slice(0,10),p.status,t.sequence,t.behavior,safeJson(t.elements),
      ])));
      writeTable(sheets.get('21 Manager Follow-up')!,['Participant','Checkpoint','Author','Author Email','Progress %','Status','Submitted At','Answers JSON'],plans.flatMap(p=>p.followUps.map(f=>[
        p.participant.name,f.kind,f.author.name,f.author.email,Number(f.progressPct),f.statusLabel,f.submittedAt?.toISOString()||'',safeJson(f.answers),
      ])));

      const metrics=await prisma.impactMetric.findMany({where:{batchId},orderBy:[{participantUserId:'asc'},{name:'asc'}]});
      const participantNames=await prisma.user.findMany({where:{id:{in:[...new Set(metrics.map(m=>m.participantUserId))]}},select:{id:true,name:true,email:true}});
      const nameMap=new Map(participantNames.map(p=>[p.id,p]));
      writeTable(sheets.get('22 Impact Metrics')!,['Participant','Email','Metric','Direction','Baseline','Day30','Change %','Improved'],metrics.map(m=>{
        const p=nameMap.get(m.participantUserId);
        return[p?.name||'',p?.email||'',m.name,m.direction,m.baseline===null?'':Number(m.baseline),m.day30===null?'':Number(m.day30),m.percentChange===null?'':Number(m.percentChange),m.improved===null?'':m.improved?'Yes':'No'];
      }));

      const evals=await prisma.evaluationL1.findMany({where:{batchId},include:{participant:{select:{name:true,email:true}}},orderBy:{participantUserId:'asc'}});
      writeTable(sheets.get('25 Evaluasi Training')!,['Participant','Email','Average L1','Submitted At','Answers JSON'],evals.map(e=>[
        e.participant.name,e.participant.email,e.averageScore===null?'':Number(e.averageScore),e.submittedAt?.toISOString()||'',safeJson(e.answers),
      ]));

      const rubrics=await prisma.rubricScore.findMany({
        where:{activity:{batchId}},
        include:{activity:{select:{type:true,title:true}},team:{select:{name:true,number:true}},observer:{select:{name:true,email:true}},rubric:{select:{code:true,name:true}}},
        orderBy:{createdAt:'asc'},
      });
      const rubricRows=(types:string[])=>rubrics.filter(r=>types.includes(r.activity.type)).map(r=>[
        r.activity.title,r.team.name,r.observer.name,r.observer.email,r.rubric.code,r.dimensionCode,Number(r.rawValue),r.weightedValue===null?'':Number(r.weightedValue),r.note||'',
      ]);
      const rh=['Activity','Team','Observer','Observer Email','Rubric','Dimension','Raw Value','Weighted Value','Note'];
      writeTable(sheets.get('17 War Room Score')!,rh,rubricRows(['WAR_ROOM']));
      writeTable(sheets.get('18 Boardroom Rubric')!,rh,rubricRows(['BOARDROOM','DELEGATION_RELAY']));

      const gameMaster=await prisma.contentItem.findFirst({where:{code:'GAME_CARDS_EXCEL_V1',isPublished:true},orderBy:{version:'desc'},select:{payload:true,version:true}});
      writeTable(sheets.get('24 Kartu Game')!,['Version','Payload JSON'],gameMaster?[[gameMaster.version,safeJson(gameMaster.payload)]]:[]);
    }else{
      const attempts=await prisma.testAttempt.findMany({where:{batchId,submittedAt:{not:null}},select:{kind:true,score:true,userId:true}});
      const pre=attempts.filter(a=>a.kind==='PRE');
      const post=attempts.filter(a=>a.kind==='POST');
      const preMap=new Map(pre.map(a=>[a.userId,a.score]));
      const gains=post.filter(a=>preMap.has(a.userId)).map(a=>a.score-(preMap.get(a.userId)||0));
      const avg=(xs:number[])=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
      writeTable(sheets.get('19b Test Scoring')!,['Metric','Value'],[
        ['Participant population',participantCount],
        ['Average Pre',avg(pre.map(a=>a.score))??''],
        ['Average Post',avg(post.map(a=>a.score))??''],
        ['Average Gain',avg(gains)??''],
        ['Participants improved',gains.filter(x=>x>0).length],
      ]);
      const metrics=await prisma.impactMetric.findMany({where:{batchId},select:{improved:true}});
      writeTable(sheets.get('22 Impact Metrics')!,['Metric','Value'],[
        ['Metrics recorded',metrics.length],
        ['Metrics improved',metrics.filter(m=>m.improved===true).length],
        ['Improvement rate',metrics.length?metrics.filter(m=>m.improved===true).length/metrics.length:''],
      ]);
      const evals=await prisma.evaluationL1.findMany({where:{batchId,averageScore:{not:null}},select:{averageScore:true}});
      writeTable(sheets.get('25 Evaluasi Training')!,['Metric','Value'],[
        ['Responses',evals.length],
        ['Average L1',evals.length?evals.reduce((s,e)=>s+Number(e.averageScore),0)/evals.length:''],
      ]);
      for(const name of sheetNames){
        const ws=sheets.get(name)!;
        if(ws.rowCount===0)writeTable(ws,['Aggregate-only export'],[['Individual records suppressed for Sponsor Viewer']]);
      }
    }

    for(const name of sheetNames){
      const ws=sheets.get(name)!;
      if(ws.rowCount===0)writeTable(ws,['Status'],[['No data for this batch']]);
    }

    const buffer=await workbook.xlsx.writeBuffer();
    const safeName=(batch.code+'-'+batch.name).replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80);
    return new Response(new Uint8Array(buffer),{
      headers:{
        'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition':`attachment; filename="Leadership_That_Works_${safeName}.xlsx"`,
        'cache-control':'no-store',
      },
    });
  }catch(e){return jsonError(e)}
}
