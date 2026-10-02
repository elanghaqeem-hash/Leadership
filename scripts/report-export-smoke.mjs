import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma=new PrismaClient();
const base=process.env.APP_URL||'http://127.0.0.1:3000';
const cookieName=process.env.SESSION_COOKIE_NAME||'ltw_session';
const userIds=[];
let tenantId;

const hash=(value)=>crypto.createHash('sha256').update(value).digest('hex');
async function session(userId){
  const token=crypto.randomBytes(32).toString('base64url');
  await prisma.authSession.create({data:{userId,tokenHash:hash(token),expiresAt:new Date(Date.now()+60*60*1000)}});
  return cookieName+'='+token;
}
async function expectFile(url,cookie,typePrefix,magic){
  const r=await fetch(base+url,{headers:{cookie}});
  if(!r.ok)throw new Error(url+' returned '+r.status+' '+await r.text());
  const type=r.headers.get('content-type')||'';
  if(!type.startsWith(typePrefix))throw new Error(url+' content-type '+type);
  const bytes=Buffer.from(await r.arrayBuffer());
  if(!bytes.subarray(0,magic.length).equals(Buffer.from(magic)))throw new Error(url+' invalid file signature');
  return bytes.length;
}

try{
  const version=await prisma.programVersion.findFirst({where:{program:{code:'LTW',isTemplate:true},status:'PUBLISHED'},orderBy:{version:'desc'}});
  const test=await prisma.test.findFirst({where:{tenantId:null,code:'LTW_PRE_POST',version:1}});
  if(!version||!test)throw new Error('Seeded program and test are required');

  const suffix=crypto.randomUUID().slice(0,8);
  const tenant=await prisma.tenant.create({data:{name:'CI Export '+suffix,slug:'ci-export-'+suffix}});
  tenantId=tenant.id;
  const batch=await prisma.batch.create({data:{
    tenantId:tenant.id,programVersionId:version.id,code:'EXP-'+suffix,name:'CI Export Batch',
    joinCode:String(100000+Math.floor(Math.random()*900000)),startDate:new Date(),endDate:new Date(Date.now()+86400000),
    status:'ACTIVE',teamCount:1,participantTarget:1,
  }});

  const participant=await prisma.user.create({data:{email:'ci-export-p-'+suffix+'@example.local',name:'CI Export Participant',isActive:true,emailVerifiedAt:new Date()}});
  const admin=await prisma.user.create({data:{email:'ci-export-a-'+suffix+'@example.local',name:'CI Export Admin',isActive:true,emailVerifiedAt:new Date()}});
  userIds.push(participant.id,admin.id);

  await prisma.tenantMembership.createMany({data:[
    {tenantId:tenant.id,userId:participant.id,role:'MEMBER',displayName:'CI Export Participant',employeeNo:'CI-001',unit:'Risk',title:'Manager'},
    {tenantId:tenant.id,userId:admin.id,role:'PROGRAM_ADMIN',displayName:'CI Export Admin'},
  ]});
  await prisma.batchMembership.createMany({data:[
    {batchId:batch.id,userId:participant.id,role:'PARTICIPANT'},
    {batchId:batch.id,userId:admin.id,role:'PROGRAM_ADMIN'},
  ]});

  await prisma.testAttempt.create({data:{
    testId:test.id,userId:participant.id,batchId:batch.id,kind:'POST',answers:{},score:85,
    startedAt:new Date(Date.now()-120000),submittedAt:new Date(),
  }});

  const participantCookie=await session(participant.id);
  const adminCookie=await session(admin.id);

  const reportBytes=await expectFile('/api/reports/batches/'+batch.id+'/participants/'+participant.id,participantCookie,'application/pdf','%PDF');
  const certificateBytes=await expectFile('/api/reports/batches/'+batch.id+'/participants/'+participant.id+'/certificate',participantCookie,'application/pdf','%PDF');
  const batchPdfBytes=await expectFile('/api/reports/batches/'+batch.id+'/evaluation',adminCookie,'application/pdf','%PDF');
  const xlsxBytes=await expectFile('/api/admin/batches/'+batch.id+'/export-xlsx',adminCookie,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','PK');

  console.log(JSON.stringify({ok:true,reportBytes,certificateBytes,batchPdfBytes,xlsxBytes},null,2));
}finally{
  if(tenantId)await prisma.tenant.delete({where:{id:tenantId}}).catch(()=>undefined);
  if(userIds.length)await prisma.user.deleteMany({where:{id:{in:userIds}}}).catch(()=>undefined);
  await prisma.$disconnect();
}
