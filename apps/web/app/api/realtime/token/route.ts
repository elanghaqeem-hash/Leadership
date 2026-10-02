import { NextResponse } from 'next/server';
import { prisma } from '@ltw/db';
import { assertPermission } from '@/lib/auth';
import { jsonError } from '@/lib/http';
import { signRealtimeToken } from '@/lib/realtime-token';

export const dynamic='force-dynamic';

export async function GET(req:Request){
  try{
    const url=new URL(req.url);
    const batchId=url.searchParams.get('batchId');
    const activityId=url.searchParams.get('activityId');
    let scope:{batchId:string;activityId?:string;tenantId:string}|null=null;
    if(activityId){
      const activity=await prisma.activity.findUnique({where:{id:activityId},select:{id:true,batchId:true,tenantId:true}});
      if(activity)scope={batchId:activity.batchId,activityId:activity.id,tenantId:activity.tenantId};
    }else if(batchId){
      const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true}});
      if(batch)scope={batchId:batch.id,tenantId:batch.tenantId};
    }
    if(!scope)return NextResponse.json({error:'Realtime scope tidak ditemukan'},{status:404});
    const user=await assertPermission('BATCH_ACTIVITY_READ',{tenantId:scope.tenantId,batchId:scope.batchId});
    const exp=Math.floor(Date.now()/1000)+300;
    const token=signRealtimeToken({batchId:scope.batchId,activityId:scope.activityId,userId:user.id,exp});
    return NextResponse.json({token,expiresAt:new Date(exp*1000).toISOString(),path:'/ws/realtime'});
  }catch(e){return jsonError(e)}
}
