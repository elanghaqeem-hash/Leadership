import ExcelJS from 'exceljs';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { HttpError, jsonError } from '@/lib/http';

export const dynamic='force-dynamic';

function avg(values:number[]){
  return values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string}>}){
  try{
    const {batchId}=await params;
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},
      select:{id:true,tenantId:true,code:true,name:true,status:true,startDate:true,endDate:true},
    });
    if(!batch)throw new HttpError('Batch tidak ditemukan',404);

    const participants=await prisma.batchMembership.findMany({
      where:{batchId,role:'PARTICIPANT',isActive:true},
      select:{userId:true},
    });
    const participantIds=participants.map(p=>p.userId);
    await assertPermission('EXPORT_AGGREGATE',{tenantId:batch.tenantId,batchId,aggregateSize:participantIds.length});

    const test=await prisma.test.findFirst({where:{tenantId:null,code:'LTW_PRE_POST',version:1},select:{id:true}});
    const attempts=test?await prisma.testAttempt.findMany({
      where:{testId:test.id,batchId,userId:{in:participantIds},submittedAt:{not:null}},
      select:{userId:true,kind:true,score:true},
    }):[];
    const pre=attempts.filter(x=>x.kind==='PRE');
    const post=attempts.filter(x=>x.kind==='POST');
    const gains=participantIds.flatMap(userId=>{
      const a=pre.find(x=>x.userId===userId),b=post.find(x=>x.userId===userId);
      return a&&b?[b.score-a.score]:[];
    });

    const evaluations=await prisma.evaluationL1.findMany({
      where:{batchId,participantUserId:{in:participantIds},submittedAt:{not:null}},
      select:{averageScore:true},
    });
    const evalValues=evaluations.flatMap(x=>x.averageScore===null?[]:[Number(x.averageScore)]);

    const plans=await prisma.thirtyDayPlan.findMany({
      where:{batchId,participantUserId:{in:participantIds}},
      select:{status:true,followUps:{select:{kind:true,progressPct:true,statusLabel:true,submittedAt:true}}},
    });

    const metrics=await prisma.impactMetric.findMany({
      where:{batchId,participantUserId:{in:participantIds}},
      select:{code:true,name:true,direction:true,baseline:true,day30:true,percentChange:true,improved:true},
    });

    const workbook=new ExcelJS.Workbook();
    workbook.creator='Leadership That Works';
    workbook.created=new Date();
    workbook.title='Training Impact Report - '+batch.name;
    workbook.subject='Aggregate training impact report';

    const summary=workbook.addWorksheet('Executive Summary',{views:[{state:'frozen',ySplit:1}]});
    summary.columns=[{header:'Metric',key:'metric',width:34},{header:'Value',key:'value',width:24},{header:'Note',key:'note',width:52}];
    const completedMetrics=metrics.filter(m=>m.baseline!==null&&m.day30!==null);
    const improvedMetrics=completedMetrics.filter(m=>m.improved===true);
    summary.addRows([
      {metric:'Batch',value:batch.name,note:batch.code+' · '+batch.status},
      {metric:'Participant population',value:participantIds.length,note:'Active PARTICIPANT memberships'},
      {metric:'L1 evaluation completion',value:evaluations.length,note:participantIds.length?((evaluations.length/participantIds.length)*100).toFixed(1)+'%':'0%'},
      {metric:'L1 average score',value:avg(evalValues),note:'Scale 1–5'},
      {metric:'Pre-test average',value:avg(pre.map(x=>x.score)),note:pre.length+' completed'},
      {metric:'Post-test average',value:avg(post.map(x=>x.score)),note:post.length+' completed'},
      {metric:'Average matched gain',value:avg(gains),note:gains.length+' matched pre/post participants'},
      {metric:'30-Day Plans created',value:plans.length,note:participantIds.length?((plans.length/participantIds.length)*100).toFixed(1)+'%':'0%'},
      {metric:'Completed plans',value:plans.filter(p=>p.status==='COMPLETED').length,note:'Status COMPLETED'},
      {metric:'Impact metric pairs completed',value:completedMetrics.length,note:'Both baseline and Day30 available'},
      {metric:'Impact metric pairs improved',value:improvedMetrics.length,note:completedMetrics.length?((improvedMetrics.length/completedMetrics.length)*100).toFixed(1)+'%':'—'},
    ]);

    const tests=workbook.addWorksheet('Learning');
    tests.columns=[
      {header:'Indicator',key:'indicator',width:30},{header:'Completed / Matched',key:'count',width:20},
      {header:'Average',key:'average',width:18},{header:'Interpretation',key:'note',width:48},
    ];
    tests.addRows([
      {indicator:'Pre-Test',count:pre.length,average:avg(pre.map(x=>x.score)),note:'Score 0–100'},
      {indicator:'Post-Test',count:post.length,average:avg(post.map(x=>x.score)),note:'Score 0–100'},
      {indicator:'Pre/Post Gain',count:gains.length,average:avg(gains),note:'Post minus Pre for matched participants'},
      {indicator:'Evaluation L1',count:evaluations.length,average:avg(evalValues),note:'Reaction score, scale 1–5'},
    ]);

    const follow=workbook.addWorksheet('Behavior Follow-up');
    follow.columns=[
      {header:'Checkpoint',key:'checkpoint',width:16},{header:'Completed',key:'completed',width:14},
      {header:'Completion %',key:'completion',width:16},{header:'Average Progress %',key:'progress',width:20},
      {header:'On Track',key:'onTrack',width:14},{header:'Perlu Dorongan',key:'push',width:18},{header:'Perlu Intervensi',key:'intervention',width:18},
    ];
    for(const kind of ['D7','D14','D30'] as const){
      const rows=plans.flatMap(p=>p.followUps.filter(f=>f.kind===kind&&f.submittedAt));
      follow.addRow({
        checkpoint:kind,
        completed:rows.length,
        completion:participantIds.length?rows.length/participantIds.length:0,
        progress:avg(rows.map(r=>Number(r.progressPct))),
        onTrack:rows.filter(r=>r.statusLabel==='ON_TRACK').length,
        push:rows.filter(r=>r.statusLabel==='PERLU_DORONGAN').length,
        intervention:rows.filter(r=>r.statusLabel==='PERLU_INTERVENSI').length,
      });
    }
    follow.getColumn('completion').numFmt='0.0%';
    follow.getColumn('progress').numFmt='0.0';

    const metricSheet=workbook.addWorksheet('Impact Metrics');
    metricSheet.columns=[
      {header:'Metric',key:'name',width:32},{header:'Direction',key:'direction',width:18},
      {header:'Pairs Completed',key:'pairs',width:18},{header:'Improved',key:'improved',width:14},
      {header:'Improvement Rate',key:'rate',width:18},{header:'Average % Change',key:'change',width:20},
    ];
    const grouped=new Map<string,typeof metrics>();
    for(const metric of metrics){
      const rows=grouped.get(metric.code)??[];
      rows.push(metric);grouped.set(metric.code,rows);
    }
    for(const rows of grouped.values()){
      const done=rows.filter(r=>r.baseline!==null&&r.day30!==null);
      const changes=done.flatMap(r=>r.percentChange===null?[]:[Number(r.percentChange)]);
      const improved=done.filter(r=>r.improved===true).length;
      metricSheet.addRow({
        name:rows[0]?.name??'',
        direction:rows[0]?.direction==='UP_IS_BETTER'?'Naik':'Turun',
        pairs:done.length,
        improved,
        rate:done.length?improved/done.length:null,
        change:avg(changes),
      });
    }
    metricSheet.getColumn('rate').numFmt='0.0%';
    metricSheet.getColumn('change').numFmt='0.0%';

    for(const ws of workbook.worksheets){
      const header=ws.getRow(1);
      header.font={bold:true};
      header.alignment={vertical:'middle'};
      header.height=24;
      ws.autoFilter={from:{row:1,column:1},to:{row:1,column:ws.columnCount}};
      ws.eachRow((row,rowNumber)=>{
        if(rowNumber>1)row.alignment={vertical:'top',wrapText:true};
      });
    }

    const bytes=Buffer.from(await workbook.xlsx.writeBuffer());
    const safe=(batch.code||'batch').replace(/[^A-Za-z0-9_-]+/g,'_');
    return new Response(bytes,{
      status:200,
      headers:{
        'content-type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'content-disposition':`attachment; filename="LTW_Impact_${safe}.xlsx"`,
        'cache-control':'no-store',
      },
    });
  }catch(e){return jsonError(e)}
}
