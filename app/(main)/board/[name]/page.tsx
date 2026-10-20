import Link from "next/link";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { BOARDS } from "@/lib/boards";
import { listPosts } from "@/lib/queries";
import PostFeed from "@/components/posts/PostFeed";
import { Icon, boardIcons } from "@/components/ui/Icon";

const descriptions: Record<string, string> = { general: "Campus questions, everyday discoveries, and everything in between.", cse: "Talk code, untangle coursework, and find people to build with.", hostel: "Late-night stories, practical advice, and life beyond the classroom.", placements: "Share opportunities, interview experiences, and your next big step.", confessions: "A place to get it off your chest. Be thoughtful, be kind, be yourself." };

export default async function BoardPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const board = BOARDS.find((item) => item.slug === name);
  if (!board) notFound();
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect("/login");
  if (!session.user.username) redirect("/setup-username");
  const { posts, nextCursor } = await listPosts({ viewerId: session.user.id, board: board.slug });
  return <><div className="mb-7 rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white p-6 sm:p-7"><span className="mb-5 inline-flex rounded-xl border border-indigo-100 bg-white p-3 text-indigo-600"><Icon name={boardIcons[board.slug] || "chat"} className="h-6 w-6" /></span><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-indigo-500">Your campus · Your community</p><h1 className="text-3xl font-bold tracking-tight text-slate-900">{board.label}</h1><p className="mt-3 max-w-lg text-xs leading-6 text-slate-500">{descriptions[board.slug]}</p><Link href={`/create?board=${board.slug}`} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-700"><Icon name="plus" className="h-4 w-4" />New post in this board</Link></div><div className="mb-4 flex items-center justify-between"><h2 className="text-xs font-bold text-slate-700">Latest discussions</h2><span className="text-[10px] text-slate-400">Newest first</span></div><PostFeed key={board.slug} initialPosts={posts} initialCursor={nextCursor} board={board.slug} /></>;
}
