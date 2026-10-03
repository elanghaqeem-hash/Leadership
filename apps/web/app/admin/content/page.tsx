import { redirect } from 'next/navigation';
import { assertPermission, AuthError } from '@/lib/auth';
import { Shell } from '@/components/Shell';
import ContentAdminClient from './ContentAdminClient';

export const dynamic = 'force-dynamic';

export default async function ContentAdminPage(){
 try{await assertPermission('CONTENT_MANAGE',{});}
 catch(error){if(error instanceof AuthError)redirect('/dashboard');throw error;}
 return <Shell title="Master Content" eyebrow="Super Admin · Content Management"><ContentAdminClient/></Shell>;
}
