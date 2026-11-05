import Link from "next/link";
import BoardNavigation from "@/components/layout/BoardNavigation";
import { Icon } from "@/components/ui/Icon";

export default function Sidebar() {
  return <aside aria-label="Forum navigation" className="sticky top-[108px] hidden w-52 shrink-0 self-start md:block lg:w-56">
    <p className="mb-4 px-3 text-xs font-semibold uppercase tracking-widest text-muted">Your community</p>
    <BoardNavigation />
    <div className="my-7 border-t border-line" />
    <section className="rounded-2xl border border-line bg-white p-5 shadow-panel">
      <Icon name="shield" className="mb-4 h-6 w-6 text-indigo-700" />
      <h2 className="text-sm font-semibold text-ink">An alias. A little freedom.</h2>
      <p className="mt-2 text-sm leading-6 text-muted">Your posts carry your chosen name. Keep identifying details out of the conversation.</p>
      <Link href="/privacy" className="mt-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-indigo-700 hover:text-indigo-900">About your privacy<Icon name="arrow-right" className="h-4 w-4" /></Link>
    </section>
    <p className="px-3 pt-7 text-xs leading-6 text-muted">A place for the conversations<br />that make campus feel like home.</p>
  </aside>;
}
