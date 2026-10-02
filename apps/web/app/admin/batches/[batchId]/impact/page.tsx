import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { assertPermission, AuthError } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import ImpactDashboardClient from './ImpactDashboardClient';

export default async function ImpactPage({params}:{params:Promise<{batchId:string}>}){
 const {batchId}=await params;
 const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,tenantId:true,code:true,name:true,_count:{select:{memberships:true}}}});
 if(!batch)redirect('/dashboard');
 try{await assertPermission('AGGREGATE_DASHBOARD_READ',{tenantId:batch.tenantId,batchId,aggregateSize:batch._count.memberships});}
 catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
 return <Shell title="Training Impact" eyebrow={batch.code+' · '+batch.name}><ImpactDashboardClient batchId={batchId}/></Shell>;
}
