import Link from "next/link";
import { BOARDS } from "@/lib/boards";

export default function BoardBadge({ slug }: { slug: string }) {
  const board = BOARDS.find((item) => item.slug === slug);
  const colors: Record<string, string> = { general: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100", cse: "bg-cyan-50 text-cyan-800 hover:bg-cyan-100", hostel: "bg-amber-50 text-amber-800 hover:bg-amber-100", placements: "bg-emerald-50 text-emerald-800 hover:bg-emerald-100", confessions: "bg-rose-50 text-rose-700 hover:bg-rose-100" };
  return <Link href={`/board/${slug}`} className={`inline-flex items-center rounded-md px-2 py-1 text-[11px] font-semibold transition ${colors[slug] || "bg-slate-100 text-slate-600"}`}>{board?.label || slug}</Link>;
}
