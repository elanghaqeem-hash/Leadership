import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import ObserverAssignmentsClient from './ObserverAssignmentsClient';

export default async function ObserverAssignmentsPage({params}:{params:Promise<{batchId:string}>}){
 const {batchId}=await params;
 const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
 if(!batch)redirect('/dashboard');
 try{await assertPermission('TEAM_MANAGE',{tenantId:batch.tenantId,batchId});}
 catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
 return <Shell title="Observer Assignment" eyebrow={batch.code+' · '+batch.name}><ObserverAssignmentsClient batchId={batchId}/></Shell>;
}
