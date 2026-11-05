"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";
import { Icon } from "@/components/ui/Icon";

export default function Navbar({ isAdmin = false }: { isAdmin?: boolean }) {
  const username = useSession().data?.user.username;
  return <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur-md">
    <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
      <Link href="/" className="inline-flex min-h-11 min-w-11 shrink-0 items-center gap-2.5 rounded-lg" aria-label="College Forum home">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink text-white"><Icon name="chat" className="h-5 w-5" /></span>
        <span className="hidden text-lg font-bold tracking-tight text-ink min-[380px]:inline">college<span className="font-normal text-muted">forum</span><span className="text-indigo-600">.</span></span>
      </Link>
      <div className="flex min-w-0 items-center gap-2 sm:gap-4">
        {isAdmin && <Link href="/admin" className="hidden min-h-11 items-center rounded-lg px-2 text-sm font-medium text-indigo-700 sm:inline-flex">Moderation</Link>}
        <Link href="/create" className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 sm:px-4"><Icon name="plus" className="h-4 w-4" /><span className="hidden sm:inline">Start a discussion</span><span className="sm:hidden">New post</span></Link>
        <div className="hidden min-w-0 items-center gap-2.5 border-l border-line pl-4 md:flex"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-bold uppercase text-indigo-700" aria-hidden="true">{username?.slice(0, 2) || "u"}</span><div className="min-w-0"><p className="max-w-36 truncate text-sm font-semibold text-ink" title={username ? `u/${username}` : undefined}>u/{username || "…"}</p><p className="text-xs text-muted">Your chosen identity</p></div></div>
        <button type="button" onClick={() => signOut({ callbackUrl: "/login" })} aria-label="Log out" title="Log out" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted transition-colors hover:bg-slate-100 hover:text-ink"><Icon name="logout" className="h-5 w-5" /></button>
      </div>
    </div>
  </header>;
}
