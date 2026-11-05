"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { BOARDS } from "@/lib/boards";
import { postSchema } from "@/lib/validators";
import { Icon } from "@/components/ui/Icon";

export default function PostForm({ defaultBoard }: { defaultBoard?: string }) {
  const [board, setBoard] = useState(defaultBoard || "general");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<{ title?: string; body?: string; board?: string }>({});
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = postSchema.safeParse({ title, body, board });
    if (!parsed.success) {
      const invalid = new Set(parsed.error.issues.map(issue => issue.path[0]));
      setFields({ title: invalid.has("title") ? "Use a title between 3 and 150 characters." : undefined, body: invalid.has("body") ? "Write between 1 and 10,000 characters." : undefined, board: invalid.has("board") ? "Choose a board from this list." : undefined });
      setError("");
      const first = ["board", "title", "body"].find(field => invalid.has(field));
      event.currentTarget.querySelector<HTMLElement>(`#post-${first}`)?.focus();
      return;
    }
    setFields({});
    setPending(true); setError("");
    try {
      const response = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data: { id?: string; error?: string } = await response.json();
      if (!response.ok || !data.id) throw new Error(data.error || "Couldn't publish your post.");
      router.push(`/post/${data.id}`); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Something went wrong. Please try again."); setPending(false); }
  }
  const fieldClass = "w-full rounded-xl border border-control bg-white px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-muted focus:border-indigo-600 focus:ring-2 focus:ring-indigo-100 disabled:bg-canvas";
  return <form onSubmit={submit} noValidate aria-busy={pending} className="rounded-2xl border border-line bg-white p-5 shadow-panel sm:p-8">
    <fieldset disabled={pending} className="space-y-7"><legend className="sr-only">Write a discussion</legend>
      <div><label htmlFor="post-board" className="mb-2 block text-sm font-semibold text-ink">Choose a board</label><select id="post-board" name="board" value={board} onChange={event => setBoard(event.target.value)} aria-invalid={Boolean(fields.board)} aria-describedby="post-board-help" className={fieldClass}>{BOARDS.map(item => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select><p id="post-board-help" className={`mt-2 text-sm leading-6 ${fields.board ? "text-red-700" : "text-muted"}`}>{fields.board || "Find the right home for your conversation."}</p></div>
      <div><div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="post-title" className="text-sm font-semibold text-ink">Title <span className="font-normal text-muted">(required)</span></label><span className="text-xs tabular-nums text-muted" aria-hidden="true">{title.length}/150</span></div><input id="post-title" name="title" value={title} onChange={event => setTitle(event.target.value)} required minLength={3} maxLength={150} placeholder="Start with a good question or a clear idea" aria-invalid={Boolean(fields.title)} aria-describedby="post-title-help" className={fieldClass} /><p id="post-title-help" className={`mt-2 text-sm leading-6 ${fields.title ? "text-red-700" : "text-muted"}`}>{fields.title || "A clear title makes your discussion easier to find. 3–150 characters."}</p></div>
      <div><div className="mb-2 flex items-center justify-between gap-3"><label htmlFor="post-body" className="text-sm font-semibold text-ink">Your post <span className="font-normal text-muted">(required)</span></label><span className="text-xs tabular-nums text-muted" aria-hidden="true">{body.length.toLocaleString()}/10,000</span></div><textarea id="post-body" name="body" value={body} onChange={event => setBody(event.target.value)} required maxLength={10000} rows={8} placeholder="Share the details. What would you like your campus to know?" aria-invalid={Boolean(fields.body)} aria-describedby="post-body-help" className={`${fieldClass} min-h-52 resize-y leading-8`} /><p id="post-body-help" className={`mt-2 text-sm leading-6 ${fields.body ? "text-red-700" : "text-muted"}`}>{fields.body || "Share a question, story or perspective. Keep it under 10,000 characters."}</p></div>
      <p className="flex items-start gap-2.5 rounded-xl bg-indigo-50 p-4 text-sm leading-6 text-indigo-900"><Icon name="shield" className="mt-1 h-4 w-4 shrink-0" />Your username is public. Leave out real names, contact details and information that could identify someone.</p>
    </fieldset>
    {error && <p role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800">{error}</p>}
    {Object.keys(fields).some(key => fields[key as keyof typeof fields]) && <p role="alert" className="sr-only">Check the highlighted fields before publishing.</p>}
    <div className="mt-7 flex items-center justify-between gap-3 border-t border-line pt-5"><Link href="/" className="inline-flex min-h-11 items-center rounded-lg px-2 text-sm font-medium text-muted hover:text-ink">Cancel</Link><button disabled={pending} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-indigo-700 disabled:opacity-60">{pending ? "Publishing…" : "Publish discussion"}<Icon name="arrow-right" className="h-4 w-4" /></button></div>
  </form>;
}
