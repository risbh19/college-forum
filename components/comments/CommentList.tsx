import type { CommentView } from "@/types";
import { timeAgo } from "@/lib/time";
import ReportButton from "@/components/ui/ReportButton";
import ModerationButtons from "@/components/ui/ModerationButtons";
import { Icon } from "@/components/ui/Icon";

export default function CommentList({ comments, isAdmin = false }: { comments: CommentView[]; isAdmin?: boolean }) {
  if (!comments.length) return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center"><Icon name="chat" className="mx-auto mb-3 h-5 w-5 text-slate-300" /><p className="text-xs font-medium text-slate-600">No comments yet.</p><p className="mt-1 text-[11px] text-slate-400">Be the first to add to the conversation.</p></div>;
  return <div className="space-y-3">{comments.map((comment) => <article key={comment.id} className="rounded-xl border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-[9px] font-bold uppercase text-indigo-500" aria-hidden="true">{comment.author.username.slice(0, 2)}</span><span className="text-[11px] font-semibold text-slate-700">u/{comment.author.username}</span>{comment.isMine && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-medium text-indigo-600">You</span>}<span className="text-[10px] text-slate-300" aria-hidden="true">·</span><time dateTime={comment.createdAt} className="text-[10px] text-slate-400">{timeAgo(comment.createdAt)}</time></div><p className="mt-3 whitespace-pre-wrap break-words text-xs leading-[1.9] text-slate-600">{comment.body}</p>{!comment.isMine && <ReportButton commentId={comment.id} />}{isAdmin && <ModerationButtons id={comment.id} kind="comments" hidden={false} />}</article>)}</div>;
}
