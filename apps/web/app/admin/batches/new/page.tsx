import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import BatchFormClient from './BatchFormClient';
export default async function Page(){if(!await getCurrentUser())redirect('/login');return <Shell title="Buat Batch Training" eyebrow="Program Administration"><BatchFormClient/></Shell>}
