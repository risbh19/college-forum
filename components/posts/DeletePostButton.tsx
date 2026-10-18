"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/ui/Icon";

export default function DeletePostButton({ postId }: { postId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  async function remove() {
    if (!window.confirm("Delete this post and all its comments? This cannot be undone.")) return;
    setPending(true); setError("");
    try {
      const response = await fetch(`/api/posts/${encodeURIComponent(postId)}`, { method: "DELETE" });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't delete this post.");
      router.push("/"); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn't delete this post. Try again."); setPending(false); }
  }
  return <div><button type="button" disabled={pending} onClick={remove} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-2 text-[11px] text-red-500 transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><Icon name="trash" className="h-3.5 w-3.5" />{pending ? "Deleting…" : "Delete post"}</button>{error && <p role="alert" className="max-w-xs text-xs text-red-600">{error}</p>}</div>;
}
