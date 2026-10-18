"use client";

import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useState, type FormEvent } from "react";
import { Icon } from "@/components/ui/Icon";

export default function CommentBox({ postId }: { postId: string }) {
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const username = useSession().data?.user.username;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!body.trim()) { setError("Write a comment before posting."); return; }
    setPending(true); setError("");
    try {
      const response = await fetch("/api/comments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, body: body.trim() }) });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't post your comment.");
      setBody(""); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn't post your comment. Please try again."); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="mb-6 rounded-xl border border-slate-200 bg-white p-4"><label htmlFor="comment-body" className="mb-3 block text-xs text-slate-500">Comment as <span className="font-semibold text-indigo-600">u/{username || "…"}</span></label><textarea id="comment-body" value={body} onChange={(event) => setBody(event.target.value)} maxLength={2000} required disabled={pending} rows={3} placeholder="Add your perspective. Keep it kind." className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-xs leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 disabled:opacity-60" />{error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}<div className="mt-3 flex items-center justify-between gap-3"><span className="text-[10px] tabular-nums text-slate-400">{body.length.toLocaleString()}/2,000</span><button disabled={pending || !body.trim()} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{pending ? "Posting…" : "Post comment"}<Icon name="arrow-right" className="h-3.5 w-3.5" /></button></div></form>;
}
