import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getPost, listComments } from "@/lib/queries";
import { timeAgo } from "@/lib/time";
import BoardBadge from "@/components/ui/BoardBadge";
import VoteButton from "@/components/ui/VoteButton";
import DeletePostButton from "@/components/posts/DeletePostButton";
import CommentBox from "@/components/comments/CommentBox";
import CommentList from "@/components/comments/CommentList";
import ReportButton from "@/components/ui/ReportButton";
import ModerationButtons from "@/components/ui/ModerationButtons";
import { backendRequest } from "@/lib/backend-client";
import { Icon } from "@/components/ui/Icon";

export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect("/login");
  if (!session.user.username) redirect("/setup-username");
  const post = await getPost(id, session.user.id);
  if (!post) notFound();
  const comments = await listComments(id, session.user.id);
  const { isAdmin } = await backendRequest<{ isAdmin: boolean }>(session.user.id, '/api/admin/status');
  return <><Link href={`/board/${post.board}`} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted transition hover:text-indigo-600"><Icon name="arrow-left" className="h-4 w-4" />Back to discussions</Link><article className="rounded-2xl border border-line bg-white p-5 sm:p-7"><div className="flex items-start gap-4"><VoteButton postId={post.id} initialScore={post.score} initialMyVote={post.myVote} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><BoardBadge slug={post.board} /><time dateTime={post.createdAt} className="text-xs text-muted">{timeAgo(post.createdAt)}</time></div><h1 className="mt-4 break-words text-xl font-bold leading-relaxed tracking-tight text-ink sm:text-2xl">{post.title}</h1><p className="mt-3 text-sm text-muted">Posted by <span className="font-medium text-muted">u/{post.author.username}</span>{post.isMine && <span className="ml-2 font-medium text-indigo-700">You</span>}</p><p className="mt-6 whitespace-pre-wrap text-base leading-8 [overflow-wrap:anywhere] text-muted">{post.body}</p><div className="mt-7 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className="flex items-center gap-1.5 text-sm text-muted"><Icon name="chat" className="h-3.5 w-3.5" />{comments.length} {comments.length === 1 ? "comment" : "comments"}</span>{post.isMine ? <DeletePostButton postId={post.id} /> : <ReportButton postId={post.id} />}</div>{isAdmin && <ModerationButtons id={post.id} kind="posts" hidden={false} />}</div></div></article><section id="comments" className="mt-8 scroll-mt-24"><h2 className="mb-5 text-sm font-bold text-ink">The conversation <span className="ml-1.5 rounded-md bg-slate-200/60 px-2 py-0.5 text-xs font-medium text-muted">{comments.length}</span></h2><CommentBox postId={post.id} /><CommentList comments={comments} isAdmin={isAdmin} /></section></>;
}
