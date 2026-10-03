import { redirect } from 'next/navigation';
import { getCurrentUser, getUserAccessSnapshot } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import BatchFormClient from './BatchFormClient';

export const dynamic = 'force-dynamic';

export default async function Page(){
  const user=await getCurrentUser();
  if(!user)redirect('/login');
  const access=await getUserAccessSnapshot(user.id);
  const allowed=user.platformRole==='SUPER_ADMIN'||Boolean(access?.tenantMemberships.some(x=>x.role==='PROGRAM_ADMIN'));
  if(!allowed)redirect('/dashboard');
  return <Shell title="Buat Batch Training" eyebrow="Program Administration"><BatchFormClient/></Shell>;
}
