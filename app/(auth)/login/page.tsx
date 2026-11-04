import type { Metadata } from "next";
import Link from "next/link";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import LocalLogin from "@/components/auth/LocalLogin";
import { Icon, boardIcons } from "@/components/ui/Icon";
import { BOARDS } from "@/lib/boards";
import { isLocalDemo } from "@/lib/local-mode";

export const metadata: Metadata = { title: "Welcome" };

const authErrors: Record<string, string> = {
  AccessDenied: "Please use a verified Gmail or Google Workspace account. A college email address is not required.",
  OAuthSignin: "We couldn't start Google sign-in. Please try again in a moment.",
  OAuthCallback: "Google sign-in couldn't be completed. Please try again.",
  OAuthAccountNotLinked: "Please sign in with the Google account you used previously.",
  Configuration: "Sign-in is temporarily unavailable. Please contact the site administrator.",
  Default: "We couldn't sign you in. Please try again.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string | string[] }> }) {
  const query = await searchParams;
  const localDemo = isLocalDemo();
  const configured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.NEXTAUTH_SECRET && (process.env.ANON_PEPPER?.length || 0) >= 32 && process.env.BACKEND_URL && (process.env.BACKEND_SHARED_SECRET?.length || 0) >= 32);
  const errorCode = typeof query.error === "string" ? query.error : undefined;


  return (
    <main className="min-h-screen bg-[#f6f7fb] lg:grid lg:grid-cols-[0.95fr_1.05fr]">
      <section aria-label="About College Forum" className="relative overflow-hidden bg-[#171b3b] px-6 py-6 text-white sm:px-10 lg:flex lg:min-h-screen lg:flex-col lg:justify-between lg:p-12 xl:px-16">
        <div aria-hidden="true" className="pointer-events-none absolute -left-44 top-20 h-[560px] w-[560px] rounded-full bg-indigo-500/15 blur-[100px]" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-52 -right-40 h-[500px] w-[500px] rounded-full bg-violet-500/10 blur-[100px]" />
        <Link href="/login" className="relative inline-flex w-fit items-center gap-3 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-300">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10"><Icon name="chat" className="h-5 w-5" /></span>
          <span className="text-lg font-semibold tracking-tight">College<span className="font-normal text-indigo-200/70"> Forum</span></span>
        </Link>
        <div className="relative hidden max-w-lg py-14 lg:block">
          <p className="mb-6 flex items-center gap-2 text-xs font-medium text-indigo-200"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />A little more room to be yourself</p>
          <h1 className="text-[48px] font-semibold leading-[1.12] tracking-[-0.045em] xl:text-[60px]">Your campus.<br />Your conversations.<br /><span className="text-indigo-300">Your chosen name.</span></h1>
          <p className="mt-6 max-w-sm text-sm leading-7 text-indigo-100/65">The questions between classes. The advice you wish you had. A space to share it all, with a username you choose.</p>
          <div className="mt-10 border-t border-white/10 pt-7">
            <p className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-indigo-200/50">Find your corner</p>
            <div className="flex flex-wrap gap-2">{BOARDS.map(board => (
              <span key={board.slug} className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-indigo-100/80"><Icon name={boardIcons[board.slug] || "chat"} className="h-3.5 w-3.5 text-indigo-300" />{board.label}</span>
            ))}</div>
          </div>
        </div>
        <p className="relative hidden items-center gap-2 text-xs text-indigo-100/45 lg:flex"><Icon name="shield" className="h-4 w-4" />Your username is public. Your email stays off your profile.</p>
      </section>

      <section aria-label="Join College Forum" className="flex min-h-[calc(100vh-88px)] flex-col px-5 py-6 sm:px-10 lg:min-h-screen lg:px-10 lg:py-8">
        <nav aria-label="Site links" className="flex items-center justify-end text-xs text-slate-500">
          <Link href="/privacy" className="rounded hover:text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">Privacy</Link>
        </nav>
        <div className="mx-auto flex w-full max-w-[460px] flex-1 items-center py-9 sm:py-12">
          <div className="w-full rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_12px_48px_-24px_rgba(23,27,59,0.25)] sm:p-9">
            <span className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600"><Icon name="sparkles" className="h-6 w-6" /></span>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-indigo-600">{localDemo ? "Your local preview" : "A seat at the conversation"}</p>
            <h2 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[34px]">{localDemo ? "Make yourself at home." : "Welcome to your space."}</h2>
            <p className="mb-7 mt-3 text-sm leading-6 text-slate-500">{localDemo ? "Explore the forum with a shared demo account on this computer." : "New here or coming back? One Google account is all you need to get started."}</p>
            {errorCode && <p role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm leading-6 text-red-700">{localDemo ? "We couldn't open this local account. Please try again." : authErrors[errorCode] || authErrors.Default}</p>}
            {localDemo ? <LocalLogin /> : <>
              <GoogleSignInButton configured={configured} />
              <p className="mt-3 text-center text-xs leading-5 text-slate-500">Personal Gmail and Google Workspace accounts are welcome.</p>
            </>}
            {!localDemo && <div className="mt-7 flex items-start gap-3 border-t border-slate-100 pt-6">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600"><Icon name="shield" className="h-4 w-4" /></span>
              <div><h3 className="text-sm font-semibold text-slate-800">Your voice. Your alias.</h3><p className="mt-1.5 text-xs leading-6 text-slate-500">Posts and comments show your chosen username. Your Google email, name, and profile photo are never stored in the forum database.</p></div>
            </div>}
            {localDemo ? <p className="mt-7 border-t border-slate-100 pt-5 text-xs leading-6 text-slate-500">These demo accounts are shared, not private. Anyone using them can act as the same users. Don’t share private information.</p> : <details className="mt-7 border-t border-slate-100 pt-5">
              <summary className="cursor-pointer text-xs font-medium text-slate-600 hover:text-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">What stays private?</summary>
              <div className="mt-3 space-y-2 text-xs leading-6 text-slate-500"><p>The forum stores a keyed anonymous ID and your chosen username. It doesn’t store your email, real name, profile picture, Google ID, or IP address.</p><p>Google sees your sign-in, and hosting providers may keep IP logs. Someone with both the database and secret key can test emails for matches. What you post can also identify you. <Link href="/privacy" className="font-medium text-indigo-600 underline underline-offset-2">Read our privacy notice</Link>.</p></div>
            </details>}
          </div>
        </div>
        <p className="text-center text-xs leading-5 text-slate-500">Be curious. Be respectful. Look out for each other.</p>
      </section>
    </main>
  );
}
