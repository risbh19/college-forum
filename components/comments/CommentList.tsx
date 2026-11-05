import type { CommentView } from "@/types";
import { timeAgo } from "@/lib/time";
import ReportButton from "@/components/ui/ReportButton";
import ModerationButtons from "@/components/ui/ModerationButtons";
import { Icon } from "@/components/ui/Icon";

export default function CommentList({ comments, isAdmin = false }: { comments: CommentView[]; isAdmin?: boolean }) {
  if (!comments.length) return <div className="rounded-xl border border-dashed border-line p-8 text-center"><Icon name="chat" className="mx-auto mb-3 h-5 w-5 text-slate-300" /><p className="text-sm font-medium text-muted">No comments yet.</p><p className="mt-1 text-sm text-muted">Be the first to add to the conversation.</p></div>;
  return <div className="space-y-3">{comments.map((comment) => <article key={comment.id} className="rounded-xl border border-line bg-white p-5"><div className="flex flex-wrap items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold uppercase text-indigo-700" aria-hidden="true">{comment.author.username.slice(0, 2)}</span><span className="text-sm font-semibold text-ink">u/{comment.author.username}</span>{comment.isMine && <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-600">You</span>}<span className="text-xs text-slate-300" aria-hidden="true">·</span><time dateTime={comment.createdAt} className="text-xs text-muted">{timeAgo(comment.createdAt)}</time></div><p className="mt-3 whitespace-pre-wrap text-base leading-8 [overflow-wrap:anywhere] text-muted">{comment.body}</p>{!comment.isMine && <ReportButton commentId={comment.id} />}{isAdmin && <ModerationButtons id={comment.id} kind="comments" hidden={false} />}</article>)}</div>;
}
