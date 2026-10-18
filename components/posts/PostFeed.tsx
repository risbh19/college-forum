"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { PaginatedPosts, PostSummary } from "@/types";
import PostCard from "@/components/posts/PostCard";
import { Icon } from "@/components/ui/Icon";

export default function PostFeed({ initialPosts, initialCursor, board }: { initialPosts: PostSummary[]; initialCursor: string | null; board?: string }) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setPosts(initialPosts);
    setCursor(initialCursor);
    setPending(false);
    setError("");
  }, [initialPosts, initialCursor, board]);
  async function loadMore() {
    if (!cursor || pending) return;
    setPending(true); setError("");
    try {
      const query = new URLSearchParams({ cursor });
      if (board) query.set("board", board);
      const response = await fetch(`/api/posts?${query}`);
      const data: PaginatedPosts & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't load more discussions.");
      setPosts((previous) => { const existing = new Set(previous.map((post) => post.id)); return [...previous, ...data.posts.filter((post) => !existing.has(post.id))]; });
      setCursor(data.nextCursor);
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn't load more discussions. Try again."); }
    finally { setPending(false); }
  }
  if (!posts.length) return <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-400"><Icon name="chat" className="h-6 w-6" /></span><h2 className="text-base font-semibold text-slate-800">A new conversation starts with you.</h2><p className="mx-auto mt-2 max-w-xs text-xs leading-6 text-slate-500">No posts yet. Be the first! Ask a question, share a thought, or say hello to your campus.</p><Link href={board ? `/create?board=${board}` : "/create"} className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700"><Icon name="plus" className="h-4 w-4" />Start a discussion</Link></section>;
  return <div><div className="space-y-4">{posts.map((post) => <PostCard key={post.id} post={post} />)}</div>{error && <p role="alert" className="mt-5 text-center text-sm text-red-600">{error}</p>}{cursor ? <button type="button" disabled={pending} onClick={loadMore} className="mt-6 w-full rounded-xl border border-slate-200 bg-white py-3 text-xs font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-60">{pending ? "Loading discussions…" : "Load more discussions"}</button> : <p className="py-8 text-center text-[11px] text-slate-400">You’re all caught up. A good time to start something new.</p>}</div>;
}
