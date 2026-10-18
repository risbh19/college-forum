import Link from "next/link";
import { Icon } from "@/components/ui/Icon";

export default function NotFound() {
  return <section className="rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center"><p className="mb-4 text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-500">404 · A quiet corner</p><h1 className="text-2xl font-bold tracking-tight text-slate-800">This conversation isn’t here.</h1><p className="mx-auto mt-3 max-w-sm text-xs leading-6 text-slate-500">The post may have been deleted, or this board doesn’t exist. There’s plenty more happening on campus.</p><Link href="/" className="mt-6 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-xs font-semibold text-white transition hover:bg-indigo-700"><Icon name="arrow-left" className="h-4 w-4" />Back to discussions</Link></section>;
}
