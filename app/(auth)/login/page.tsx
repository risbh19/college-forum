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
    <main className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[0.95fr_1.05fr]">
      <section aria-label="About College Forum" className="relative flex flex-col overflow-hidden bg-ink px-6 py-6 text-white sm:px-10 lg:min-h-dvh lg:justify-between lg:px-14 lg:py-10 xl:px-20">
        <Link href="/login" className="relative inline-flex min-h-11 w-fit items-center gap-3 rounded-xl" aria-label="College Forum home"><span className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20"><Icon name="chat" className="h-5 w-5" /></span><span className="text-xl font-semibold tracking-tight">college<span className="font-normal text-slate-300">forum</span><span className="text-indigo-300">.</span></span></Link>
        <div className="relative hidden max-w-lg py-16 lg:block">
          <p className="mb-7 text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200">The campus common room</p>
          <p className="text-5xl font-semibold leading-[1.12] tracking-[-0.045em] xl:text-6xl">Big thoughts.<br />Real conversations.<br /><span className="text-indigo-200">Your chosen name.</span></p>
          <p className="mt-7 max-w-sm text-base leading-8 text-slate-300">From the question you almost didn’t ask to the advice that makes a difference. There’s a place for it here.</p>
          <div className="mt-12 border-t border-white/15 pt-7"><p className="mb-4 text-xs font-semibold uppercase tracking-widest text-slate-300">Find your corner</p><div className="flex flex-wrap gap-2">{BOARDS.map(board => <span key={board.slug} className="inline-flex items-center gap-2 rounded-full border border-white/20 px-3.5 py-2 text-sm text-slate-200"><Icon name={boardIcons[board.slug] || "chat"} className="h-4 w-4 text-indigo-200" />{board.label}</span>)}</div></div>
        </div>
        <p className="hidden items-center gap-2 text-sm leading-6 text-slate-300 lg:flex"><Icon name="shield" className="h-4 w-4 shrink-0 text-indigo-200" />A community built around your alias.</p>
      </section>
      <section aria-label="Join College Forum" className="flex min-h-[calc(100dvh-92px)] flex-col px-5 py-6 sm:px-10 lg:min-h-dvh lg:px-12 lg:py-8">
        <nav aria-label="Site links" className="flex justify-end"><Link href="/privacy" className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-medium text-muted hover:text-indigo-700"><Icon name="shield" className="h-4 w-4" />Privacy</Link></nav>
        <div className="mx-auto flex w-full max-w-[480px] flex-1 items-center py-8 sm:py-12">
          <div className="w-full rounded-3xl border border-line bg-white p-6 shadow-float sm:p-10">
            <span className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><Icon name="chat" className="h-6 w-6" /></span>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-700">{localDemo ? "Explore on your computer" : "A space to be yourself"}</p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">{localDemo ? "Make yourself at home." : "Welcome to your common room."}</h1>
            <p className="mb-8 mt-4 text-base leading-7 text-muted">{localDemo ? "Try the forum with a shared demo account. No external sign-in needed." : "Questions, ideas and honest conversations. Bring your perspective."}</p>
            {errorCode && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">{localDemo ? "We couldn't open this local account. Please try again." : authErrors[errorCode] || authErrors.Default}</p>}
            {localDemo ? <LocalLogin /> : <><GoogleSignInButton configured={configured} /><p className="mt-4 text-center text-sm leading-6 text-muted">Personal Gmail and Google Workspace accounts are welcome.</p></>}
            {!localDemo && <section className="mt-8 flex gap-3 border-t border-line pt-6"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-700"><Icon name="shield" className="h-5 w-5" /></span><div><h2 className="text-sm font-semibold text-ink">Your voice. Your alias.</h2><p className="mt-2 text-sm leading-6 text-muted">Your posts show your chosen username. Your Google email, name and photo are never stored in the forum database.</p></div></section>}
            {localDemo ? <p className="mt-6 border-t border-line pt-5 text-sm leading-6 text-muted">Demo accounts are shared, not private. Avoid sharing personal information.</p> : <details className="mt-6 border-t border-line pt-2"><summary className="min-h-11 py-3 text-sm font-semibold text-muted hover:text-indigo-700">What anonymity means here</summary><div className="space-y-3 pb-2 text-sm leading-7 text-muted"><p>The forum uses a keyed anonymous ID and your chosen username. It does not store your Google identity or IP address.</p><p>Google sees sign-in and hosting providers may keep IP logs. Someone with the database and secret key can test emails for matches. Your writing and what you share can identify you.</p><Link href="/privacy" className="inline-flex min-h-11 items-center gap-2 font-semibold text-indigo-700">Read the privacy notice<Icon name="arrow-right" className="h-4 w-4" /></Link></div></details>}
          </div>
        </div>
        <p className="text-center text-sm leading-6 text-muted">A little curiosity. A little kindness. A lot to talk about.</p>
      </section>
    </main>
  );
}
