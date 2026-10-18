import BoardNavigation from "@/components/layout/BoardNavigation";
import { Icon } from "@/components/ui/Icon";

export default function Sidebar() {
  return <aside className="sticky top-[108px] hidden w-52 shrink-0 self-start md:block lg:w-56">
    <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">Your campus</p>
    <BoardNavigation />
    <div className="mx-3 my-7 border-t border-slate-200" />
    <div className="mx-1 rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4"><span className="mb-3 inline-flex rounded-lg bg-white p-2 text-indigo-500 shadow-sm"><Icon name="shield" className="h-4 w-4" /></span><h2 className="text-xs font-semibold text-slate-800">Your voice. Your space.</h2><p className="mt-2 text-[11px] leading-[1.8] text-slate-500">An alias lets you speak freely. Keep identifying details out of your posts.</p></div>
    <p className="px-4 pt-7 text-[10px] leading-5 text-slate-400">Made for the conversations<br />that make campus, campus.</p>
    <p className="px-4 pt-3 text-[10px] text-slate-400">College Forum · A little more connected.</p>
  </aside>;
}
