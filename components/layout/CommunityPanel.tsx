import Link from "next/link";
import { BOARDS } from "@/lib/boards";
import { Icon, boardIcons } from "@/components/ui/Icon";
import { isLocalDemo } from "@/lib/local-mode";

const descriptions: Record<string, string> = { general: "A little bit of everything", cse: "Code, courses & collaboration", hostel: "Life beyond the classroom", placements: "Your next chapter starts here", confessions: "Get it off your chest" };

export default function CommunityPanel() {
  const localDemo = isLocalDemo();
  return <aside className="hidden w-[270px] shrink-0 space-y-5 xl:block">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-xs font-bold text-slate-800">Find your corner</h2><p className="mt-1 text-[11px] text-slate-400">There’s a board for that.</p></div><div className="p-2">{BOARDS.map((board) => <Link key={board.slug} href={`/board/${board.slug}`} className="group flex items-center gap-3 rounded-xl p-3 transition hover:bg-slate-50"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-500 group-hover:bg-indigo-50 group-hover:text-indigo-600"><Icon name={boardIcons[board.slug] || "chat"} className="h-4 w-4" /></span><span><span className="block text-xs font-semibold text-slate-700">{board.label}</span><span className="mt-1 block text-[10px] text-slate-400">{descriptions[board.slug]}</span></span><Icon name="arrow-right" className="ml-auto h-3.5 w-3.5 text-slate-300" /></Link>)}</div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2"><Icon name="sparkles" className="h-4 w-4 text-amber-500" /><h2 className="text-xs font-bold text-slate-800">Good conversations start here</h2></div><ol className="mt-5 space-y-4">{["Be kind. There’s a person behind every username.", "Protect your privacy and everyone else’s.", "Keep it relevant to your board.", "Disagree with ideas. Respect people."].map((rule, index) => <li key={rule} className="flex gap-3 text-[11px] leading-[1.8] text-slate-500"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-50 text-[9px] font-semibold text-slate-400">{index + 1}</span>{rule}</li>)}</ol></section>
    <div className="px-2 text-[10px] leading-[1.8] text-slate-400"><p className="mb-1 flex items-center gap-1.5 font-medium text-slate-500"><Icon name="shield" className="h-3 w-3" />{localDemo ? "About this local demo" : "A note on anonymity"}</p><p>{localDemo ? "These are shared demo accounts. Data is saved in this project folder; anyone using an account can act as that user. Avoid sharing private information." : "Your real name and email aren’t stored by this app. Google sees your sign-in, and hosting providers may keep IP logs. Share thoughtfully."}</p></div>
  </aside>;
}
