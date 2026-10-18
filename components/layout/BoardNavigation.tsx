"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BOARDS } from "@/lib/boards";
import { Icon, boardIcons } from "@/components/ui/Icon";

export default function BoardNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const links = [{ slug: "all", label: "All discussions", href: "/" }, ...BOARDS.map((board) => ({ ...board, href: `/board/${board.slug}` }))];
  return <nav aria-label={mobile ? "Mobile boards" : "Boards"} className={mobile ? "flex gap-2 overflow-x-auto px-4 py-3" : "space-y-1"}>
    {links.map((board) => { const active = pathname === board.href; return <Link key={board.slug} href={board.href} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 whitespace-nowrap rounded-lg text-xs font-medium transition ${mobile ? "shrink-0 px-3 py-2" : "px-3 py-3"} ${active ? "bg-indigo-50 text-indigo-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}><Icon name={boardIcons[board.slug] || "grid"} className="h-[18px] w-[18px]" />{board.label}{active && !mobile && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-500" />}</Link>; })}
  </nav>;
}
