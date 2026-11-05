"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { usernameSchema } from "@/lib/validators";
import { Icon } from "@/components/ui/Icon";

export default function UsernameForm() {
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { update } = useSession();
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!usernameSchema.safeParse(username).success) { setError("Use 3–20 letters, numbers or underscores, and avoid reserved names such as admin."); event.currentTarget.querySelector<HTMLInputElement>("input")?.focus(); return; }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/username", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username }) });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "We couldn't save your username.");
      const session = await update();
      if (!session?.user.username) throw new Error("Your username is saved. Please refresh this page to continue.");
      router.replace("/");
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again."); setPending(false); }
  }
  return <form onSubmit={submit} className="space-y-5">
    <div><label htmlFor="username" className="mb-2 block text-sm font-semibold text-ink">Your username</label><div className="flex items-center rounded-xl border border-control bg-canvas focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100"><span className="pl-4 text-muted" aria-hidden="true">u/</span><input id="username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" spellCheck={false} minLength={3} maxLength={20} pattern="[a-zA-Z0-9_]{3,20}" required aria-describedby={error ? "username-help username-error" : "username-help"} aria-invalid={Boolean(error)} disabled={pending} placeholder="your_campus_alias" className="min-w-0 flex-1 rounded-xl bg-transparent py-3 pl-1 pr-4 text-base text-ink outline-none placeholder:text-muted" /></div><p id="username-help" className="mt-2 text-sm leading-5 text-muted">3–20 characters. Letters, numbers, and underscores only.</p></div>
    <p className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm leading-5 text-indigo-800">Make it yours. Your username is permanent, so choose an alias that doesn’t reveal your identity.</p>
    {error && <p id="username-error" role="alert" className="text-sm text-red-600">{error}</p>}
    <button disabled={pending} className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{pending ? "Saving your username…" : "Join the conversation"}<Icon name="arrow-right" className="h-4 w-4" /></button>
  </form>;
}
