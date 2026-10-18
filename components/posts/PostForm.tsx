"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BOARDS } from "@/lib/boards";
import { Icon } from "@/components/ui/Icon";

export default function PostForm({ defaultBoard }: { defaultBoard?: string }) {
  const [board, setBoard] = useState(defaultBoard || "general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length < 3 || title.trim().length > 150) { setError("Your title needs to be 3–150 characters."); return; }
    if (!body.trim() || body.trim().length > 10000) { setError("Your post needs to be 1–10,000 characters."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.trim(), body: body.trim(), board }) });
      const data: { id?: string; error?: string } = await response.json();
      if (!response.ok || !data.id) throw new Error(data.error || "Couldn't publish your post.");
      router.push(`/post/${data.id}`); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again."); setPending(false); }
  }
  const fieldClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:bg-slate-50";
  return <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
    <fieldset disabled={pending} className="space-y-6"><div><label htmlFor="post-board" className="mb-2 block text-xs font-semibold text-slate-700">Choose a board</label><select id="post-board" value={board} onChange={(event) => setBoard(event.target.value)} className={fieldClass}>{BOARDS.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select><p className="mt-2 text-[11px] text-slate-400">Find the right home for your conversation.</p></div>
    <div><div className="mb-2 flex items-center justify-between"><label htmlFor="post-title" className="text-xs font-semibold text-slate-700">Title</label><span className="text-[10px] tabular-nums text-slate-400">{title.length}/150</span></div><input id="post-title" value={title} onChange={(event) => setTitle(event.target.value)} required minLength={3} maxLength={150} placeholder="What’s on your mind?" className={fieldClass} /></div>
    <div><div className="mb-2 flex items-center justify-between"><label htmlFor="post-body" className="text-xs font-semibold text-slate-700">Your post</label><span className="text-[10px] tabular-nums text-slate-400">{body.length.toLocaleString()}/10,000</span></div><textarea id="post-body" value={body} onChange={(event) => setBody(event.target.value)} required maxLength={10000} rows={9} placeholder="Share the details. A good question, a useful tip, a campus story…" className={`${fieldClass} min-h-52 resize-y leading-7`} /><p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-slate-400"><Icon name="shield" className="mt-0.5 h-3.5 w-3.5 shrink-0" />Your username is public. Avoid real names, contact details, or details that could identify someone.</p></div></fieldset>
    {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}
    <div className="mt-7 flex items-center justify-between border-t border-slate-100 pt-5"><Link href="/" className="rounded-lg px-2 py-2 text-xs font-medium text-slate-500 transition hover:text-slate-900">Cancel</Link><button disabled={pending} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-60">{pending ? "Publishing…" : "Publish post"}<Icon name="arrow-right" className="h-4 w-4" /></button></div>
  </form>;
}
