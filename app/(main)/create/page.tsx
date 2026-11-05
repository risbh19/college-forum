import Link from "next/link";
import { BOARDS } from "@/lib/boards";
import PostForm from "@/components/posts/PostForm";
import { Icon } from "@/components/ui/Icon";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ board?: string | string[] }> }) {
  const query = await searchParams;
  const requestedBoard = typeof query.board === "string" ? query.board : undefined;
  const defaultBoard = BOARDS.find((board) => board.slug === requestedBoard)?.slug;
  return <><Link href={defaultBoard ? `/board/${defaultBoard}` : "/"} className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-muted transition hover:text-indigo-600"><Icon name="arrow-left" className="h-4 w-4" />Back to discussions</Link><div className="mb-6"><p className="mb-2 text-xs font-bold uppercase tracking-[0.17em] text-indigo-700">Make some room for your thoughts</p><h1 className="text-3xl font-bold tracking-tight text-ink">Create a post</h1><p className="mt-3 text-sm leading-6 text-muted">A question, a story, a thought. Your campus is listening.</p></div><PostForm defaultBoard={defaultBoard} /></>;
}
