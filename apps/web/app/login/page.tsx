import LoginForm from './LoginForm';
import { BUILD_ID } from '@/lib/build-info';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function LoginPage(){
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-8">
      <section className="w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60">
        <div className="bg-navy px-6 py-7 text-white">
          <div className="text-xs font-bold uppercase tracking-[.2em] text-amber-300">Leadership That Works</div>
          <h1 className="mt-3 text-3xl font-semibold">Training Delivery & Impact Platform</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">Lead Yourself. Think Better. Decide Smarter. Execute Stronger.</p>
        </div>
        <div className="p-6">
          <LoginForm/>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            Line Manager menggunakan magic link yang dikirim melalui undangan program. Jangan membagikan kredensial atau tautan login.
          </p>
          <p className="mt-3 text-[10px] font-medium tracking-wide text-slate-400" data-build-id={BUILD_ID}>
            Build {BUILD_ID}
          </p>
        </div>
      </section>
    </main>
  );
}
