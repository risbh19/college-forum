"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

type LocalAccount = "student-one" | "student-two" | "new-student";

export default function LocalLogin() {
  const [pending, setPending] = useState<LocalAccount | null>(null);
  const [error, setError] = useState("");

  async function login(account: LocalAccount) {
    setPending(account);
    setError("");
    try {
      await signIn("local-demo", { account, callbackUrl: "/" });
    } catch {
      setError("We couldn’t open this local account. Please try again.");
      setPending(null);
    }
  }

  return <div>
    <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-900"><Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="font-semibold">Local demo</p><p>Accounts are shared on this computer; this demo is not private. No Google account is needed.</p></div></div>
    <div className="space-y-3">
      <button type="button" disabled={Boolean(pending)} onClick={() => login("student-one")} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-indigo-600 px-4 py-3 text-left text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60"><span>{pending === "student-one" ? "Opening shadowcoder42…" : "Explore as shadowcoder"}<span className="mt-0.5 block text-[10px] font-normal text-indigo-200">u/shadowcoder42</span></span><Icon name="arrow-right" className="h-4 w-4" /></button>
      <button type="button" disabled={Boolean(pending)} onClick={() => login("student-two")} className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-xs font-semibold text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60"><span>{pending === "student-two" ? "Opening campusowl…" : "Switch to campusowl"}<span className="mt-0.5 block text-[10px] font-normal text-slate-400">u/campusowl · Try a second perspective</span></span><Icon name="arrow-right" className="h-4 w-4 text-slate-400" /></button>
      <button type="button" disabled={Boolean(pending)} onClick={() => login("new-student")} className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-indigo-600 transition hover:bg-indigo-50 disabled:cursor-wait disabled:opacity-60">{pending === "new-student" ? "Opening username setup…" : "Try username setup"}<Icon name="pen" className="h-3.5 w-3.5" /></button>
    </div>
    {error && <p role="alert" className="mt-3 text-xs leading-5 text-red-600">{error}</p>}
  </div>;
}
