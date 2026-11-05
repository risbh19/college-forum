import Link from "next/link";
import type { PostSummary } from "@/types";
import { timeAgo } from "@/lib/time";
import BoardBadge from "@/components/ui/BoardBadge";
import VoteButton from "@/components/ui/VoteButton";
import { Icon } from "@/components/ui/Icon";
import ReportButton from "@/components/ui/ReportButton";

export default function PostCard({ post }: { post: PostSummary }) {
  return <article className="rounded-2xl border border-line bg-white p-4 shadow-panel transition-colors hover:border-indigo-200 sm:p-6">
    <div className="flex items-start gap-3 sm:gap-5"><VoteButton postId={post.id} initialScore={post.score} initialMyVote={post.myVote} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1"><BoardBadge slug={post.board} /><span className="break-words text-xs font-medium text-muted">u/{post.author.username}</span><span className="text-slate-300" aria-hidden="true">·</span><time dateTime={post.createdAt} className="text-xs text-muted">{timeAgo(post.createdAt)}</time>{post.isMine && <span className="rounded-md bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-800">You</span>}</div>
        <h2 className="mt-3 text-lg font-semibold leading-7 tracking-tight text-ink [overflow-wrap:anywhere] sm:text-xl"><Link href={`/post/${post.id}`} className="rounded-sm transition-colors hover:text-indigo-700">{post.title}</Link></h2>
        <p className="mt-2.5 line-clamp-3 whitespace-pre-wrap text-base leading-7 text-muted [overflow-wrap:anywhere]">{post.body}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2"><Link href={`/post/${post.id}#comments`} className="inline-flex min-h-11 items-center gap-2 rounded-lg pr-3 text-sm font-medium text-muted hover:text-indigo-700"><Icon name="chat" className="h-4 w-4" />{post.commentCount} {post.commentCount === 1 ? "reply" : "replies"}</Link><Link href={`/post/${post.id}`} aria-label={`Read ${post.title}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-semibold text-indigo-700 hover:text-indigo-900">Read discussion<Icon name="arrow-right" className="h-4 w-4" /></Link></div>
        {!post.isMine && <ReportButton postId={post.id} />}
      </div>
    </div>
  </article>;
}
