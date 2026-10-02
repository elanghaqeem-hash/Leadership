import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import JoinForm from './JoinForm';

export default async function JoinPage({searchParams}:{searchParams:Promise<{code?:string}>}){
 const user=await getCurrentUser();
 if(!user)redirect('/login');
 const query=await searchParams;
 return <main className="min-h-screen bg-slate-50 px-4 py-8"><div className="mx-auto max-w-lg"><JoinForm initialCode={query.code||''}/></div></main>;
}
