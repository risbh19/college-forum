import Link from "next/link";
import { BOARDS } from "@/lib/boards";
import PostForm from "@/components/posts/PostForm";
import { Icon } from "@/components/ui/Icon";

export default function CreatePage({ searchParams }: { searchParams: { board?: string | string[] } }) {
  const requestedBoard = typeof searchParams.board === "string" ? searchParams.board : undefined;
  const defaultBoard = BOARDS.find((board) => board.slug === requestedBoard)?.slug;
  return <><Link href={defaultBoard ? `/board/${defaultBoard}` : "/"} className="mb-6 inline-flex items-center gap-2 text-xs font-medium text-slate-500 transition hover:text-indigo-600"><Icon name="arrow-left" className="h-4 w-4" />Back to discussions</Link><div className="mb-6"><p className="mb-2 text-[10px] font-bold uppercase tracking-[0.17em] text-indigo-500">Make some room for your thoughts</p><h1 className="text-3xl font-bold tracking-tight text-slate-900">Create a post</h1><p className="mt-3 text-xs leading-6 text-slate-500">A question, a story, a thought. Your campus is listening.</p></div><PostForm defaultBoard={defaultBoard} /></>;
}
