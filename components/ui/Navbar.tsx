"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Icon } from "@/components/ui/Icon";

export default function Navbar() {
  const username = useSession().data?.user.username;
  return <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
    <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
      <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="College Forum home"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm shadow-indigo-200"><Icon name="chat" className="h-5 w-5" /></span><span className="text-[17px] font-bold tracking-tight text-slate-900">College<span className="font-normal text-slate-500"> Forum</span></span><span className="ml-1 hidden rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-slate-500 sm:inline">Campus space</span></Link>
      <div className="flex items-center gap-3 sm:gap-5">
        <Link href="/create" className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 sm:px-4"><Icon name="plus" className="h-4 w-4" /><span className="hidden sm:inline">New post</span><span className="sm:hidden">Post</span></Link>
        <span className="hidden h-7 w-px bg-slate-200 sm:block" />
        <div className="hidden items-center gap-2.5 md:flex"><span className="flex h-9 w-9 items-center justify-center rounded-full border border-indigo-100 bg-indigo-50 text-xs font-bold uppercase text-indigo-600" aria-hidden="true">{username?.slice(0, 2) || "u"}</span><div><p className="max-w-40 truncate text-xs font-semibold text-slate-700">u/{username || "…"}</p><p className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400"><Icon name="shield" className="h-3 w-3" />Anonymous member</p></div></div>
        <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} aria-label="Log out" title="Log out" className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-800"><Icon name="logout" className="h-[18px] w-[18px]" /></button>
      </div>
    </div>
  </header>;
}
