import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { listPosts } from "@/lib/queries";
import PostFeed from "@/components/posts/PostFeed";
import { Icon } from "@/components/ui/Icon";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect("/login");
  if (!session.user.username) redirect("/setup-username");
  const { posts, nextCursor } = await listPosts({ viewerId: session.user.id });
  return <><div className="mb-7"><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-indigo-500">The campus common room</p><h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-[34px]">Your campus. Unfiltered<span className="text-indigo-500">.</span></h1><p className="mt-3 text-xs leading-6 text-slate-500 sm:text-sm">Big questions, little discoveries, and everything in between.</p></div>
    <Link href="/create" className="mb-7 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-indigo-300 hover:shadow-sm"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-xs font-bold uppercase text-indigo-500" aria-hidden="true">{session.user.username.slice(0, 2)}</span><span className="flex-1 text-xs text-slate-400">What’s on your mind, {session.user.username}?</span><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600"><Icon name="pen" className="h-4 w-4" /></span></Link>
    <div className="mb-4 flex items-center justify-between"><h2 className="flex items-center gap-2 text-xs font-bold text-slate-700"><Icon name="grid" className="h-3.5 w-3.5 text-slate-400" />All discussions</h2><span className="text-[10px] text-slate-400">Newest first</span></div>
    <PostFeed key="all" initialPosts={posts} initialCursor={nextCursor} />
  </>;
}
