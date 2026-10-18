import Link from "next/link";
import type { PostSummary } from "@/types";
import { timeAgo } from "@/lib/time";
import BoardBadge from "@/components/ui/BoardBadge";
import VoteButton from "@/components/ui/VoteButton";
import { Icon } from "@/components/ui/Icon";

export default function PostCard({ post }: { post: PostSummary }) {
  return <article className="group flex gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300 hover:shadow-sm sm:gap-4 sm:p-5">
    <VoteButton postId={post.id} initialScore={post.score} initialMyVote={post.myVote} />
    <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-x-2 gap-y-1"><BoardBadge slug={post.board} /><span className="text-[10px] text-slate-400">Posted by <span className="font-medium text-slate-500">u/{post.author.username}</span></span><span className="text-[10px] text-slate-300" aria-hidden="true">·</span><time dateTime={post.createdAt} className="text-[10px] text-slate-400">{timeAgo(post.createdAt)}</time>{post.isMine && <span className="text-[10px] font-medium text-indigo-500">You</span>}</div>
      <h2 className="mt-3 break-words text-[15px] font-semibold leading-relaxed text-slate-900 sm:text-base"><Link href={`/post/${post.id}`} className="transition hover:text-indigo-600">{post.title}</Link></h2>
      <p className="mt-2 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-[1.85] text-slate-500">{post.body}</p>
      <div className="mt-4 flex items-center justify-between"><Link href={`/post/${post.id}#comments`} className="inline-flex items-center gap-1.5 rounded-md py-1 text-[11px] font-medium text-slate-500 transition hover:text-indigo-600"><Icon name="chat" className="h-3.5 w-3.5" />{post.commentCount} {post.commentCount === 1 ? "comment" : "comments"}</Link><Link href={`/post/${post.id}`} aria-label={`Read ${post.title}`} className="flex items-center gap-1 text-[10px] font-medium text-slate-400 transition hover:text-indigo-600">Join the conversation<Icon name="arrow-right" className="h-3 w-3" /></Link></div>
    </div>
  </article>;
}
