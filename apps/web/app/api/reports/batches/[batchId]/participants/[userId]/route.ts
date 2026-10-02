import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { newReport, pdfFooter, pdfKeyValue, pdfMetricCard, pdfParagraph, pdfSection } from '@/lib/report-pdf';

function pct(value:number|null|undefined){
  return value===null||value===undefined?'-':(value*100).toFixed(1)+'%';
}
function num(value:number|null|undefined,digits=1){
  return value===null||value===undefined?'-':value.toFixed(digits);
}
function idDate(value:Date|string|null|undefined){
  if(!value)return'-';
  return new Date(value).toLocaleDateString('id-ID',{timeZone:'UTC',day:'2-digit',month:'short',year:'numeric'});
}

export async function GET(_req:Request,{params}:{params:Promise<{batchId:string;userId:string}>}){
  try{
    const {batchId,userId}=await params;
    const batch=await prisma.batch.findUnique({
      where:{id:batchId},
      select:{id:true,tenantId:true,code:true,name:true,startDate:true,endDate:true,tenant:{select:{name:true}}},
    });
    if(!batch)return NextResponse.json({error:'Batch tidak ditemukan'},{status:404});
    await assertPermission('EXPORT_INDIVIDUAL',{tenantId:batch.tenantId,batchId,resourceUserId:userId});

    const membership=await prisma.batchMembership.findUnique({
      where:{batchId_userId:{batchId,userId}},
      select:{
        role:true,isActive:true,team:{select:{name:true,number:true}},
        user:{select:{
          id:true,name:true,email:true,
          tenantMemberships:{where:{tenantId:batch.tenantId},take:1,select:{displayName:true,employeeNo:true,unit:true,title:true}},
        }},
      },
    });
    if(!membership||membership.role!=='PARTICIPANT')return NextResponse.json({error:'Participant tidak ditemukan'},{status:404});
    const profile=membership.user.tenantMemberships[0];

    const [diagnostics,testAttempts,evaluation,plan,metrics,submissions]=await Promise.all([
      prisma.submission.findMany({
        where:{batchId,userId,activity:{type:'SELF_DIAGNOSTIC'}},
        include:{activity:{select:{config:true,title:true}}},
        orderBy:{submittedAt:'asc'},
      }),
      prisma.testAttempt.findMany({
        where:{batchId,userId,submittedAt:{not:null}},
        select:{kind:true,score:true,submittedAt:true},
      }),
      prisma.evaluationL1.findUnique({
        where:{batchId_participantUserId:{batchId,participantUserId:userId}},
        select:{averageScore:true,submittedAt:true},
      }),
      prisma.thirtyDayPlan.findUnique({
        where:{batchId_participantUserId:{batchId,participantUserId:userId}},
        include:{targets:{orderBy:{sequence:'asc'}},followUps:{orderBy:{kind:'asc'}}},
      }),
      prisma.impactMetric.findMany({
        where:{batchId,participantUserId:userId},
        orderBy:{name:'asc'},
      }),
      prisma.submission.findMany({
        where:{batchId,userId,submittedAt:{not:null},isPrivateReflection:false},
        select:{activityId:true},
      }),
    ]);

    const preDiag=diagnostics.find(x=>(x.activity.config as any)?.mode==='PRE');
    const postDiag=diagnostics.find(x=>(x.activity.config as any)?.mode==='POST');
    const pre=testAttempts.find(x=>x.kind==='PRE')?.score??null;
    const post=testAttempts.find(x=>x.kind==='POST')?.score??null;
    const gain=pre!==null&&post!==null?post-pre:null;
    const completedActivities=new Set(submissions.map(x=>x.activityId)).size;
    const improved=metrics.filter(m=>m.improved===true).length;
    const completedMetrics=metrics.filter(m=>m.baseline!==null&&m.day30!==null).length;

    const {doc,page,y:initialY}=newReport(
      'Participant Impact Report',
      batch.tenant.name,
      batch.code+' · '+batch.name,
    );
    let y=initialY;
    y=pdfSection(page,y,'Participant');
    y=pdfKeyValue(page,y,'Nama',profile?.displayName||membership.user.name);
    y=pdfKeyValue(page,y,'NIP',profile?.employeeNo||'-');
    y=pdfKeyValue(page,y,'Unit / Jabatan',[profile?.unit,profile?.title].filter(Boolean).join(' · ')||'-');
    y=pdfKeyValue(page,y,'Email',membership.user.email);
    y=pdfKeyValue(page,y,'Tim',membership.team?membership.team.name:'Belum ditugaskan');
    y=pdfKeyValue(page,y,'Periode Training',idDate(batch.startDate)+' - '+idDate(batch.endDate));

    y-=6;
    y=pdfSection(page,y,'Learning & Participation');
    pdfMetricCard(page,50,y,116,'Pre-Test',pre===null?'-':String(pre),'0-100');
    pdfMetricCard(page,177,y,116,'Post-Test',post===null?'-':String(post),'0-100');
    pdfMetricCard(page,304,y,116,'Gain',gain===null?'-':(gain>=0?'+':'')+gain,'Post - Pre');
    pdfMetricCard(page,431,y,116,'L1',evaluation?.averageScore===null||evaluation?.averageScore===undefined?'-':Number(evaluation.averageScore).toFixed(2),'Scale 1-5');
    y-=62;
    const preDiagScore=preDiag?.score===null||preDiag?.score===undefined?null:Number(preDiag.score);
    const postDiagScore=postDiag?.score===null||postDiag?.score===undefined?null:Number(postDiag.score);
    y=pdfKeyValue(page,y,'Self-Diagnostic Pre',num(preDiagScore,2));
    y=pdfKeyValue(page,y,'Self-Diagnostic Post',num(postDiagScore,2));
    y=pdfKeyValue(page,y,'Aktivitas individu tersimpan',String(completedActivities));

    y-=4;
    y=pdfSection(page,y,'30-Day Plan');
    if(!plan){
      y=pdfParagraph(page,y,'30-Day Plan belum tersedia untuk participant ini.');
    }else{
      y=pdfKeyValue(page,y,'Status',plan.status);
      y=pdfKeyValue(page,y,'Review',`D+7 ${idDate(plan.reviewD7)} · D+14 ${idDate(plan.reviewD14)} · D+30 ${idDate(plan.reviewD30)}`);
      for(const target of plan.targets){
        y=pdfParagraph(page,y,`Target ${target.sequence}: ${target.behavior}`,{bold:true,maxChars:80});
        const elements=target.elements as any;
        if(elements?.successMeasure)y=pdfParagraph(page,y,`Success measure: ${elements.successMeasure}`,{maxChars:86});
        y-=4;
      }
    }
    pdfFooter(page,'Participant Impact Report · '+batch.code);

    const page2=doc.addPage();
    let y2=720;
    page2.text(46,800,'LEADERSHIP THAT WORKS',10,true);
    page2.text(46,780,'Impact Metrics & Follow-up',18,true);
    y2=pdfSection(page2,y2,'Impact Metrics');
    if(metrics.length===0){
      y2=pdfParagraph(page2,y2,'Belum ada impact metric yang direkam.');
    }else{
      for(const m of metrics){
        const baseline=m.baseline===null?'-':String(Number(m.baseline));
        const day30=m.day30===null?'-':String(Number(m.day30));
        const change=m.percentChange===null?'-':pct(Number(m.percentChange));
        const status=m.improved===null?'-':m.improved?'Membaik':'Belum membaik';
        y2=pdfParagraph(page2,y2,`${m.name}: baseline ${baseline} · D30 ${day30} · change ${change} · ${status}`,{maxChars:92});
        y2-=3;
        if(y2<160)break;
      }
      y2-=6;
      y2=pdfKeyValue(page2,y2,'Metrik completed',String(completedMetrics));
      y2=pdfKeyValue(page2,y2,'Metrik membaik',String(improved));
    }

    y2-=6;
    y2=pdfSection(page2,y2,'Checkpoint Follow-up');
    if(!plan||plan.followUps.length===0){
      y2=pdfParagraph(page2,y2,'Belum ada checkpoint D+7/D+14/D+30 yang tersimpan.');
    }else{
      for(const f of plan.followUps){
        y2=pdfParagraph(page2,y2,`${f.kind}: ${Number(f.progressPct).toFixed(0)}% · ${f.statusLabel} · ${idDate(f.submittedAt)}`,{bold:true,maxChars:82});
      }
    }

    y2-=8;
    y2=pdfSection(page2,y2,'Interpretasi');
    y2=pdfParagraph(page2,y2,'Rapor ini merangkum data yang tersedia di platform. Nilai dan indikator harus dibaca bersama konteks pekerjaan, bukti implementasi, serta feedback manager. Dokumen ini bukan penilaian kinerja SDM formal dan tidak memuat refleksi pribadi participant.',{maxChars:92});
    pdfFooter(page2,'Participant Impact Report · '+batch.code);

    const bytes=doc.render();
    const safe=(profile?.displayName||membership.user.name).replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,60);
    return new Response(new Uint8Array(bytes),{
      headers:{
        'content-type':'application/pdf',
        'content-disposition':`attachment; filename="LTW_Report_${safe}.pdf"`,
        'cache-control':'no-store',
      },
    });
  }catch(e){return jsonError(e)}
}
