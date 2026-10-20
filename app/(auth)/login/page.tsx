import type { Metadata } from "next";
import Link from "next/link";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import LocalLogin from "@/components/auth/LocalLogin";
import { Icon, boardIcons } from "@/components/ui/Icon";
import { BOARDS } from "@/lib/boards";
import { isLocalDemo } from "@/lib/local-mode";
import { COLLEGE_DOMAIN } from "@/lib/access-policy";

export const metadata: Metadata = { title: "Welcome" };

const authErrors: Record<string, string> = {
  AccessDenied: "Use your college-managed @rkgit.edu.in Google account. Personal Gmail and other domains cannot join this forum.",
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
  const allowedDomain = COLLEGE_DOMAIN;
  const steps = localDemo ? [
    { number: "01", title: "Choose a local account", text: "Open a shared demo account to explore the forum on this computer." },
    { number: "02", title: "Start a conversation", text: "Create a post, choose a board, and share your thoughts." },
    { number: "03", title: "Try another perspective", text: "Log out and choose the other account to test comments and votes." },
  ] : [
    { number: "01", title: "Verify your college account", text: "Sign in with your @rkgit.edu.in Google account. We don’t store your email." },
    { number: "02", title: "Choose your campus alias", text: "Pick a permanent username. Your real name stays off your profile." },
    { number: "03", title: "Find your conversation", text: "Ask, share, and connect with your campus community." },
  ];
  return <main className="grid min-h-screen bg-white lg:grid-cols-[1.08fr_1fr]">
    <section className="relative flex overflow-hidden bg-[#161a3b] px-6 py-7 text-white sm:px-12 lg:min-h-screen lg:flex-col lg:justify-between lg:px-14 lg:py-10 xl:px-20">
      <div className="pointer-events-none absolute -left-40 top-20 h-[600px] w-[600px] rounded-full bg-indigo-700/20 blur-[100px]" aria-hidden="true" /><div className="pointer-events-none absolute -right-52 bottom-0 h-[500px] w-[500px] rounded-full bg-indigo-400/10 blur-[100px]" aria-hidden="true" />
      <div className="relative z-10 flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/10"><Icon name="chat" className="h-5 w-5" /></span><span className="text-lg font-bold tracking-tight">College<span className="font-normal text-indigo-200/70"> Forum</span></span></div>
      <div className="relative z-10 hidden py-12 lg:block"><div className="mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-300/20 bg-indigo-300/5 px-3 py-1.5 text-[10px] font-medium tracking-wide text-indigo-200"><span className="h-1.5 w-1.5 rounded-full bg-indigo-300" />Your campus, a little closer.</div><h1 className="max-w-lg text-[48px] font-bold leading-[1.15] tracking-[-0.04em] xl:text-[56px]">The conversations<br />between classes<span className="text-indigo-400">.</span></h1><p className="mt-6 max-w-sm text-sm leading-7 text-indigo-100/55">From your first question to your next big step. A place to share what’s on your mind, with a name you choose.</p>
        <div className="relative mt-10 rounded-2xl border border-white/10 bg-white/[0.035] p-6"><div className="mb-5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-indigo-200/50"><span className="h-1 w-1 rounded-full bg-indigo-300" />Many corners. One community.</div><div className="flex flex-wrap gap-2.5">{BOARDS.map((board) => <span key={board.slug} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200/15 bg-indigo-200/[0.06] px-3 py-2.5 text-[11px] font-medium text-indigo-100/80"><Icon name={boardIcons[board.slug] || "chat"} className="h-3.5 w-3.5 text-indigo-300" />{board.label}</span>)}</div><div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-400/10 text-indigo-300"><Icon name="shield" className="h-4 w-4" /></span><p className="text-[11px] text-indigo-100/55">Your alias is public. Your real identity isn’t your profile.</p></div></div>
      </div>
      <div className="relative z-10 hidden items-center justify-between text-[10px] text-indigo-200/35 lg:flex"><span>A space for your campus voice.</span><span>Thoughts welcome.</span></div>
    </section>
    <section className="flex min-h-[calc(100vh-96px)] flex-col px-6 py-10 sm:px-12 lg:min-h-screen lg:px-14 lg:py-10 xl:px-20"><div className="hidden items-center justify-end gap-1.5 text-[10px] text-slate-400 lg:flex"><Icon name="shield" className="h-3.5 w-3.5" />An alias. A little more freedom.</div>
      <div className="mx-auto my-auto w-full max-w-[370px] py-8"><span className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-100 bg-indigo-50 text-indigo-500"><Icon name="sparkles" className="h-6 w-6" /></span><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-indigo-500">Your seat at the conversation</p><h2 className="text-[32px] font-bold tracking-tight text-slate-900">Welcome to your space.</h2><p className="mb-8 mt-3 text-sm leading-7 text-slate-500">Real campus life. Real conversations.<br />A little more room to be yourself.</p>
        {errorCode && <p role="alert" className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-xs leading-6 text-red-700">{localDemo ? "We couldn’t open this local account. Please try again." : authErrors[errorCode] || authErrors.Default}</p>}
        {localDemo ? <LocalLogin /> : <><GoogleSignInButton configured={configured} /><p className="mt-4 text-center text-[11px] leading-5 text-slate-400">{allowedDomain ? <>Use your <span className="font-medium text-slate-600">@{allowedDomain}</span> college Google account.</> : "A verified Google account is required to join."}</p></>}
        <div className="my-7 flex items-center gap-4"><span className="h-px flex-1 bg-slate-100" /><span className="text-[9px] font-medium uppercase tracking-[0.14em] text-slate-400">Here’s how it works</span><span className="h-px flex-1 bg-slate-100" /></div>
        <div className="space-y-5">{steps.map((step) => <div key={step.number} className="flex gap-3.5"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-[9px] font-semibold text-slate-400">{step.number}</span><div><h3 className="text-xs font-semibold text-slate-700">{step.title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-400">{step.text}</p></div></div>)}</div>
        {localDemo ? <p className="mt-8 border-t border-slate-100 pt-5 text-[10px] leading-[1.8] text-slate-400">Local demo data is saved in this project folder. Anyone using these shared accounts can act as the same users. Use this mode to explore the app; don’t share private information.</p> : <details className="mt-8 border-t border-slate-100 pt-5"><summary className="cursor-pointer text-[11px] font-medium text-slate-500 transition hover:text-indigo-600">What anonymity means here</summary><div className="mt-3 space-y-2 text-[10px] leading-[1.8] text-slate-400"><p>The database stores an anonymous ID derived from your email with a secret key and your chosen username. It doesn’t store your email, real name, profile photo, Google ID, or IP address.</p><p>Google sees your sign-in. Hosting providers may keep IP logs. Someone with both the database and secret key can test a list of emails for matches. The details, timing, and writing style of a post can also identify its author.</p></div></details>}
      </div><p className="text-center text-[10px] text-slate-400">Be curious. Be respectful. Look out for each other. <Link href="/privacy" className="ml-2 underline">Privacy</Link></p>
    </section>
  </main>;
}
