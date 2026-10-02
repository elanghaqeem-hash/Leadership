import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import AuditTrailClient from './AuditTrailClient';

export default async function AuditTrailPage({params}:{params:Promise<{batchId:string}>}){
 const {batchId}=await params;
 const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true}});
 if(!batch)redirect('/dashboard');
 try{await assertPermission('AUDIT_READ',{tenantId:batch.tenantId,batchId});}
 catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
 return <Shell title="Audit Trail" eyebrow={batch.code+' · '+batch.name}><AuditTrailClient batchId={batchId}/></Shell>;
}
