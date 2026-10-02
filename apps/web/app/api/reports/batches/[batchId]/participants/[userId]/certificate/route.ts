import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { SimplePdfDocument } from '@/lib/simple-pdf';

function idDate(value:Date|string){
  return new Date(value).toLocaleDateString('id-ID',{timeZone:'UTC',day:'2-digit',month:'long',year:'numeric'});
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
        role:true,isActive:true,
        user:{select:{id:true,name:true,email:true,tenantMemberships:{where:{tenantId:batch.tenantId},take:1,select:{displayName:true,employeeNo:true}}}},
      },
    });
    if(!membership||membership.role!=='PARTICIPANT'||!membership.isActive)return NextResponse.json({error:'Participant aktif tidak ditemukan'},{status:404});

    const test=await prisma.test.findFirst({where:{tenantId:null,code:'LTW_PRE_POST',version:1},select:{id:true}});
    const post=test?await prisma.testAttempt.findUnique({
      where:{testId_userId_batchId_kind:{testId:test.id,userId,batchId,kind:'POST'}},
      select:{submittedAt:true,score:true},
    }):null;
    if(!post?.submittedAt){
      return NextResponse.json({error:'Sertifikat tersedia setelah participant menyelesaikan Post-Test'},{status:409});
    }

    const profile=membership.user.tenantMemberships[0];
    const participantName=profile?.displayName||membership.user.name;
    const certNo=`LTW-${batch.code.replace(/[^A-Za-z0-9]/g,'').slice(0,16)}-${userId.replace(/-/g,'').slice(0,8).toUpperCase()}`;

    const doc=new SimplePdfDocument();
    const page=doc.addPage();

    page.rect(25,25,545,792,{strokeGray:0.15,width:2});
    page.rect(32,32,531,778,{strokeGray:0.65,width:0.7});
    page.centered(754,'LEADERSHIP THAT WORKS',16,true);
    page.centered(730,'CERTIFICATE OF COMPLETION',24,true);
    page.centered(705,'Lead Yourself. Think Better. Decide Smarter. Execute Stronger.',9,false);
    page.line(120,686,475,686,0.7);

    page.centered(640,'Diberikan kepada',11,false);
    page.centered(602,participantName,26,true);
    page.centered(576,profile?.employeeNo?`NIP ${profile.employeeNo}`:'Banking Professional',10,false);

    page.centered(525,'atas penyelesaian program training 2 hari',11,false);
    page.centered(494,batch.name,17,true);
    page.centered(466,'Time Management, Critical Thinking & Decision Making for Banking Professionals',10,false);

    page.centered(410,`${batch.tenant.name} · ${idDate(batch.startDate)} - ${idDate(batch.endDate)}`,10,false);

    page.rect(82,324,185,70,{fillGray:0.96,strokeGray:0.75,width:0.6});
    page.text(96,369,'POST-TEST',8,true);
    page.text(96,345,String(post.score)+' / 100',18,true);

    page.rect(328,324,185,70,{fillGray:0.96,strokeGray:0.75,width:0.6});
    page.text(342,369,'CERTIFICATE ID',8,true);
    page.text(342,345,certNo,11,true);

    page.line(90,220,245,220,0.7);
    page.line(350,220,505,220,0.7);
    page.centered(196,'Lead Trainer / Facilitator',9,false);
    page.centered(176,'Program Administration',9,false);

    page.centered(104,'Issued by Leadership That Works Training Delivery & Impact Platform',8,false);
    page.centered(86,'Dokumen elektronik. Validitas mengacu pada data batch dan Post-Test di platform.',8,false);

    const bytes=doc.render();
    const safe=participantName.replace(/[^A-Za-z0-9_-]+/g,'_').slice(0,60);
    return new Response(new Uint8Array(bytes),{
      headers:{
        'content-type':'application/pdf',
        'content-disposition':`attachment; filename="LTW_Certificate_${safe}.pdf"`,
        'cache-control':'no-store',
      },
    });
  }catch(e){return jsonError(e)}
}
