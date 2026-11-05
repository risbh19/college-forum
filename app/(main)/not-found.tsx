import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export default function NotFound() {
  return <section className="rounded-2xl border border-line bg-white px-6 py-16 text-center"><p className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-indigo-700">404 · A quiet corner</p><h1 className="text-2xl font-bold tracking-tight text-ink">This conversation isn’t here.</h1><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-muted">The post may have been deleted, or this board doesn’t exist. There’s plenty more happening on campus.</p><Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"><Icon name="arrow-left" className="h-4 w-4" />Back to discussions</Link></section>;
}
