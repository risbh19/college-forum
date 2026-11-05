import Link from "next/link";
import { BOARDS } from "@/lib/boards";
import { Icon, boardIcons } from "@/components/ui/Icon";
import { isLocalDemo } from "@/lib/local-mode";

const descriptions: Record<string, string> = { general: "A little of everything", cse: "Code, courses & collaboration", hostel: "Beyond the classroom", placements: "Make your next move", confessions: "A little off your chest" };

export default function CommunityPanel() {
  const localDemo = isLocalDemo();
  return <aside aria-label="Community information" className="hidden w-64 shrink-0 space-y-5 xl:block">
    <section className="rounded-2xl border border-line bg-white p-5 shadow-panel">
      <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-indigo-700">Find your people</p><h2 className="text-lg font-semibold tracking-tight text-ink">There’s a board for that.</h2>
      <div className="-mx-2 mt-4 space-y-1">{BOARDS.map(board => <Link key={board.slug} href={`/board/${board.slug}`} className="group flex min-h-16 items-center gap-3 rounded-xl px-2 py-3 transition-colors hover:bg-indigo-50"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted group-hover:bg-white group-hover:text-indigo-700"><Icon name={boardIcons[board.slug] || "chat"} className="h-5 w-5" /></span><span className="min-w-0"><span className="block text-sm font-semibold text-ink">{board.label}</span><span className="mt-0.5 block text-xs leading-5 text-muted">{descriptions[board.slug]}</span></span></Link>)}</div>
    </section>
    <section className="rounded-2xl border border-line bg-white p-5"><h2 className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="heart" className="h-4 w-4 text-indigo-700" />A good space, together</h2><ul className="mt-4 space-y-3">{["Be kind to the person behind the username.", "Protect your privacy and everyone else’s.", "Disagree with ideas. Respect people."].map(rule => <li key={rule} className="flex gap-2.5 text-sm leading-6 text-muted"><Icon name="check" className="mt-1 h-4 w-4 shrink-0 text-indigo-700" />{rule}</li>)}</ul></section>
    <p className="px-2 text-xs leading-6 text-muted">{localDemo ? "Local demo: shared accounts are not private. Data stays in this project folder." : "Google sees your sign-in. Hosting providers may keep IP logs. What you share can also identify you."}</p>
  </aside>;
}
