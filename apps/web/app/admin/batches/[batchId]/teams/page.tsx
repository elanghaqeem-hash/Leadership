import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import TeamsClient from './TeamsClient';

export default async function TeamsPage({params}:{params:Promise<{batchId:string}>}){
 const {batchId}=await params;
 const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,name:true,code:true}});
 if(!batch)redirect('/dashboard');
 try{await assertPermission('TEAM_MANAGE',{tenantId:batch.tenantId,batchId});}
 catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
 return <Shell title="Kelola Tim" eyebrow={batch.code+' · '+batch.name}><TeamsClient batchId={batchId}/></Shell>;
}
