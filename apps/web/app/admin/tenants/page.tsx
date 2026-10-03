import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import TenantAdminClient from './TenantAdminClient';

export const dynamic = 'force-dynamic';
export default async function Page(){const u=await getCurrentUser();if(!u)redirect('/login');if(u.platformRole!=='SUPER_ADMIN')redirect('/dashboard');return <Shell title="Tenant / Bank" eyebrow="Platform Administration"><TenantAdminClient/></Shell>}
