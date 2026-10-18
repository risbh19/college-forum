import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import UsernameForm from "@/components/auth/UsernameForm";
import { Icon } from "@/components/ui/Icon";

export const metadata: Metadata = { title: "Choose your alias" };

export default async function SetupUsernamePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect("/login");
  if (session.user.username) redirect("/");
  return <main className="flex min-h-screen flex-col bg-slate-50 px-5 py-8"><div className="mx-auto flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><Icon name="chat" className="h-[18px] w-[18px]" /></span><span className="text-base font-bold tracking-tight text-slate-900">College<span className="font-normal text-slate-500"> Forum</span></span></div><div className="mx-auto my-auto w-full max-w-md py-12"><div className="mb-5 flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400"><span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600"><Icon name="check" className="h-3 w-3" /></span>Account verified<span className="mx-1 h-px w-7 bg-slate-200" /><span className="flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-[9px] text-white">2</span><span className="text-indigo-600">Choose your alias</span></div><section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9"><span className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-500"><Icon name="pen" className="h-5 w-5" /></span><h1 className="text-2xl font-bold tracking-tight text-slate-900">What should we call you?</h1><p className="mb-7 mt-3 text-xs leading-6 text-slate-500">A fresh alias. The same you.<br />Choose the name your campus will see.</p><UsernameForm /></section><p className="mx-auto mt-6 flex max-w-sm items-start justify-center gap-2 text-center text-[10px] leading-5 text-slate-400"><Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Your username appears on your posts and comments. Avoid using your real name or student ID.</p></div><p className="text-center text-[10px] text-slate-400">Your campus. Your voice. Your space.</p></main>;
}
