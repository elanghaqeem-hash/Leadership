import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import ReadinessClient from './ReadinessClient';

export default async function ReadinessPage({params}:{params:Promise<{batchId:string}>}){
 const {batchId}=await params;
 const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
 if(!batch)redirect('/dashboard');
 try{await assertPermission('TEAM_MANAGE',{tenantId:batch.tenantId,batchId});}
 catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
 return <Shell title="Batch Readiness" eyebrow={batch.code+' · '+batch.name}><ReadinessClient batchId={batchId}/></Shell>;
}
