import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { SimplePdfDocument } from '@/lib/simple-pdf';
import { pdfFooter, pdfKeyValue, pdfMetricCard, pdfParagraph, pdfSection } from '@/lib/report-pdf';

function avg(values:number[]){return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;}
function fmt(value:number|null,digits=1){return value===null?'-':value.toFixed(digits);}
function idDate(value:Date){return value.toLocaleDateString('id-ID',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'});}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},
      select:{id:true,tenantId:true,code:true,name:true,status:true,startDate:true,endDate:true,tenant:{select:{name:true}}},
    });
    if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
    const participants=await prisma.batchMembership.findMany({
      where:{batchId,role:'PARTICIPANT',isActive:true},
      select:{userId:true},
    });
    const ids=participants.map(p=>p.userId);
    await assertPermission('EXPORT_AGGREGATE',{tenantId:batch.tenantId,batchId,aggregateSize:ids.length});

    const test=await prisma.test.findFirst({where:{tenantId:null,code:'LTW_PRE_POST',version:1},select:{id:true}});
    const [attempts,evaluations,plans,metrics]=await Promise.all([
      test?prisma.testAttempt.findMany({
        where:{testId:test.id,batchId,userId:{in:ids},submittedAt:{not:null}},
        select:{userId:true,kind:true,score:true},
      }):Promise.resolve([]),
      prisma.evaluationL1.findMany({
        where:{batchId,participantUserId:{in:ids},submittedAt:{not:null}},
        select:{averageScore:true},
      }),
      prisma.thirtyDayPlan.findMany({
        where:{batchId,participantUserId:{in:ids}},
        select:{status:true,followUps:{select:{kind:true,progressPct:true,statusLabel:true,submittedAt:true}}},
      }),
      prisma.impactMetric.findMany({
        where:{batchId,participantUserId:{in:ids}},
        select:{name:true,code:true,baseline:true,day30:true,percentChange:true,improved:true,direction:true},
      }),
    ]);

    const pre=attempts.filter(a=>a.kind==='PRE');
    const post=attempts.filter(a=>a.kind==='POST');
    const preMap=new Map(pre.map(a=>[a.userId,a.score]));
    const gains=post.filter(a=>preMap.has(a.userId)).map(a=>a.score-(preMap.get(a.userId)??0));
    const l1=evaluations.flatMap(e=>e.averageScore===null?[]:[Number(e.averageScore)]);
    const d30=plans.flatMap(p=>p.followUps.filter(f=>f.kind==='D30'&&f.submittedAt));
    const d30OnTrack=d30.filter(f=>f.statusLabel==='ON_TRACK').length;
    const completedMetrics=metrics.filter(m=>m.baseline!==null&&m.day30!==null);
    const improvedMetrics=completedMetrics.filter(m=>m.improved===true);

    const doc=new SimplePdfDocument();
    const page=doc.addPage();
    page.rect(0,762,595.28,79,{fillGray:0.10});
    page.text(46,812,'LEADERSHIP THAT WORKS',10,true);
    page.text(46,794,batch.tenant.name,9,false);
    page.text(46,773,'Batch Evaluation Report',20,true);
    page.text(46,751,batch.code+' · '+batch.name,9,false);

    let y=720;
    y=pdfSection(page,y,'Executive Summary');
    y=pdfKeyValue(page,y,'Periode',idDate(batch.startDate)+' - '+idDate(batch.endDate));
    y=pdfKeyValue(page,y,'Status Batch',batch.status);
    y=pdfKeyValue(page,y,'Participant Aktif',String(ids.length));

    y-=8;
    pdfMetricCard(page,50,y,116,'L1 Average',fmt(avg(l1),2),evaluations.length+' response');
    pdfMetricCard(page,177,y,116,'Pre-Test',fmt(avg(pre.map(x=>x.score)),1),pre.length+' completed');
    pdfMetricCard(page,304,y,116,'Post-Test',fmt(avg(post.map(x=>x.score)),1),post.length+' completed');
    pdfMetricCard(page,431,y,116,'Avg Gain',fmt(avg(gains),1),gains.length+' matched');
    y-=65;

    y=pdfSection(page,y,'Kirkpatrick L1-L4 Snapshot');
    y=pdfKeyValue(page,y,'L1 - Reaction',`${evaluations.length}/${ids.length} response · rata-rata ${fmt(avg(l1),2)}/5`);
    y=pdfKeyValue(page,y,'L2 - Learning',`${gains.length} matched Pre/Post · average gain ${fmt(avg(gains),1)} poin`);
    y=pdfKeyValue(page,y,'L3 - Behavior',`${plans.length}/${ids.length} 30-Day Plan · D30 completed ${d30.length} · On Track ${d30OnTrack}`);
    y=pdfKeyValue(page,y,'L4 - Results',`${completedMetrics.length} metric pairs completed · ${improvedMetrics.length} membaik`);

    y-=8;
    y=pdfSection(page,y,'Interpretation Guardrails');
    y=pdfParagraph(page,y,'L1 mengukur reaksi peserta; L2 menggambarkan perubahan skor pembelajaran; L3 menggunakan 30-Day Plan dan checkpoint perilaku; L4 merangkum impact metrics baseline vs Day 30. Data agregat harus dibaca bersama konteks unit, kualitas baseline, dan tingkat penyelesaian follow-up.',{maxChars:92});
    pdfFooter(page,'Batch Evaluation Report · '+batch.code);

    const page2=doc.addPage();
    page2.text(46,800,'LEADERSHIP THAT WORKS',10,true);
    page2.text(46,780,'Behavior & Impact Detail',18,true);
    let y2=748;
    y2=pdfSection(page2,y2,'D+30 Behavior Status');
    const statusRows=[
      ['On Track',d30.filter(x=>x.statusLabel==='ON_TRACK').length],
      ['Perlu Dorongan',d30.filter(x=>x.statusLabel==='PERLU_DORONGAN').length],
      ['Perlu Intervensi',d30.filter(x=>x.statusLabel==='PERLU_INTERVENSI').length],
    ] as const;
    for(const [label,count] of statusRows)y2=pdfKeyValue(page2,y2,label,`${count} participant`);
    y2=pdfKeyValue(page2,y2,'Average Progress D+30',fmt(avg(d30.map(x=>Number(x.progressPct))),1)+'%');

    y2-=8;
    y2=pdfSection(page2,y2,'Impact Metrics by Indicator');
    const grouped=new Map<string,typeof metrics>();
    for(const m of metrics){const rows=grouped.get(m.code)??[];rows.push(m);grouped.set(m.code,rows);}
    for(const rows of grouped.values()){
      const done=rows.filter(r=>r.baseline!==null&&r.day30!==null);
      const improved=done.filter(r=>r.improved===true).length;
      const changes=done.flatMap(r=>r.percentChange===null?[]:[Number(r.percentChange)*100]);
      y2=pdfParagraph(page2,y2,`${rows[0]?.name||rows[0]?.code}: ${improved}/${done.length} membaik · avg change ${fmt(avg(changes),1)}%`,{maxChars:90});
      y2-=3;
      if(y2<120)break;
    }
    pdfFooter(page2,'Aggregate report · minimum Sponsor population = 5');

    const bytes=doc.render();
    const safe=batch.code.replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,40);
    return new Response(new Uint8Array(bytes),{
      headers:{
        'content-type':'application/pdf',
        'content-disposition':`attachment; filename="LTW_Batch_Report_${safe}.pdf"`,
        'cache-control':'no-store',
      },
    });
  }catch(e){return jsonError(e)}
}
