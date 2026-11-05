"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BOARDS } from "@/lib/boards";
import { Icon, boardIcons } from "@/components/ui/Icon";

export default function BoardNavigation({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const links = [{ slug: "all", label: "All discussions", href: "/" }, ...BOARDS.map(board => ({ ...board, href: `/board/${board.slug}` }))];
  if (mobile) return <nav aria-label="Mobile boards" className="px-4 py-3">
    <form className="flex items-end gap-2" onSubmit={event => {
      event.preventDefault();
      const destination = new FormData(event.currentTarget).get("board");
      const board = links.find(link => link.href === destination);
      if (board) router.push(board.href);
    }}>
      <div className="min-w-0 flex-1">
        <label htmlFor="mobile-board" className="mb-1.5 block text-sm font-semibold text-muted">Browse boards</label>
        <select key={pathname} id="mobile-board" name="board" defaultValue={links.find(board => board.href === pathname)?.href || "/"} className="w-full min-w-0 rounded-xl border border-control bg-white px-3 py-2 text-base font-medium text-ink">{links.map(board => <option key={board.slug} value={board.href}>{board.label}</option>)}</select>
      </div>
      <button type="submit" className="inline-flex min-h-12 items-center justify-center rounded-xl border border-control bg-white px-4 text-sm font-semibold text-ink hover:bg-indigo-50">Go</button>
    </form>
  </nav>;
  return <nav aria-label="Boards" className="space-y-1.5">{links.map(board => {
    const active = pathname === board.href;
    return <Link key={board.slug} href={board.href} aria-current={active ? "page" : undefined} className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors ${active ? "bg-indigo-50 text-indigo-800" : "text-muted hover:bg-white hover:text-ink"}`}>
      <Icon name={boardIcons[board.slug] || "grid"} className="h-5 w-5 shrink-0" />{board.label}{active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-indigo-600" aria-hidden="true" />}
    </Link>;
  })}</nav>;
}
