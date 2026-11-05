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
  return <>
    <div className="mb-7"><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-700">A space for your campus voice</p><h1 className="text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">The campus common room<span className="text-indigo-600">.</span></h1><p className="mt-3 max-w-xl text-base leading-7 text-muted">Big questions, little discoveries, and everything in between. Find a conversation that feels like you.</p></div>
    <Link href="/create" className="group mb-8 flex min-h-20 items-center gap-3 rounded-2xl border border-line bg-white p-4 shadow-panel transition-colors hover:border-indigo-300 sm:gap-4 sm:p-5"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-sm font-semibold uppercase text-indigo-700" aria-hidden="true">{session.user.username.slice(0, 2)}</span><span className="min-w-0 flex-1 text-base text-muted [overflow-wrap:anywhere]">What’s on your mind, {session.user.username}?</span><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700 transition-colors group-hover:bg-indigo-100"><Icon name="pen" className="h-5 w-5" /></span></Link>
    <div className="mb-5 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-base font-semibold text-ink"><Icon name="grid" className="h-4 w-4 text-muted" />Latest discussions</h2><span className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted">Newest first</span></div>
    <PostFeed key="all" initialPosts={posts} initialCursor={nextCursor} />
  </>;
}
