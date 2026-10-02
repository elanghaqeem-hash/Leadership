import { redirect } from 'next/navigation';
import { prisma } from '@ltw/db';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import ManagerFollowUpClient from './ManagerFollowUpClient';

export default async function ManagerBatchPage({params}:{params:Promise<{batchId:string}>}){
 const {batchId}=await params;
 const user=await getCurrentUser();if(!user)redirect('/login');
 const batch=await prisma.batch.findUnique({where:{id:batchId},select:{id:true,code:true,name:true}});
 if(!batch)redirect('/dashboard');
 const membership=await prisma.batchMembership.findUnique({where:{batchId_userId:{batchId,userId:user.id}},select:{role:true,isActive:true}});
 if(!membership?.isActive||membership.role!=='LINE_MANAGER')redirect('/dashboard');
 return <Shell title="Manager Follow-up" eyebrow={batch.code+' · '+batch.name}><ManagerFollowUpClient batchId={batchId}/></Shell>;
}
