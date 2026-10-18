"use client";

import { useEffect, useState } from "react";
import type { VoteValue } from "@/types";
import { Icon } from "@/components/ui/Icon";

type VoteState = { score: number; myVote: VoteValue | null };
export default function VoteButton({ postId, initialScore, initialMyVote }: { postId: string; initialScore: number; initialMyVote: VoteValue | null }) {
  const [state, setState] = useState<VoteState>({ score: initialScore, myVote: initialMyVote });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setState({ score: initialScore, myVote: initialMyVote }); }, [initialScore, initialMyVote]);
  async function vote(type: VoteValue) {
    if (pending) return;
    const previous = state;
    const nextVote = previous.myVote === type ? null : type;
    const value = (voteValue: VoteValue | null) => voteValue === "UP" ? 1 : voteValue === "DOWN" ? -1 : 0;
    setState({ myVote: nextVote, score: previous.score - value(previous.myVote) + value(nextVote) });
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/votes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, type }) });
      const data: VoteState & { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't save vote.");
      setState({ score: data.score, myVote: data.myVote });
    } catch (failure) { setState(previous); setError(failure instanceof Error ? failure.message : "Couldn't save vote. Try again."); }
    finally { setPending(false); }
  }
  return <div className="relative flex shrink-0 flex-col items-center self-start rounded-xl bg-slate-50 p-1">
    <button type="button" aria-label="Upvote" aria-pressed={state.myVote === "UP"} disabled={pending} onClick={() => vote("UP")} className={`rounded-lg p-1.5 transition disabled:opacity-50 ${state.myVote === "UP" ? "bg-orange-100 text-orange-600" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"}`}><Icon name="arrow-up" className="h-[18px] w-[18px]" /></button>
    <span aria-live="polite" className={`py-1 text-xs font-bold tabular-nums ${state.myVote === "UP" ? "text-orange-600" : state.myVote === "DOWN" ? "text-blue-600" : "text-slate-700"}`}>{state.score}</span>
    <button type="button" aria-label="Downvote" aria-pressed={state.myVote === "DOWN"} disabled={pending} onClick={() => vote("DOWN")} className={`rounded-lg p-1.5 transition disabled:opacity-50 ${state.myVote === "DOWN" ? "bg-blue-100 text-blue-600" : "text-slate-400 hover:bg-slate-200 hover:text-slate-700"}`}><Icon name="arrow-down" className="h-[18px] w-[18px]" /></button>
    {error && <p role="alert" className="absolute left-0 top-full z-10 mt-2 w-52 rounded-lg border border-red-100 bg-white p-3 text-xs text-red-600 shadow-md">{error}</p>}
  </div>;
}
