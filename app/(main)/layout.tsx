import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Navbar from "@/components/ui/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import BoardNavigation from "@/components/layout/BoardNavigation";
import CommunityPanel from "@/components/layout/CommunityPanel";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect("/login");
  if (!session.user.username) redirect("/setup-username");
  return <><a href="#main-content" className="sr-only z-50 rounded-lg bg-indigo-600 px-4 py-3 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a><Navbar /><div className="border-b border-slate-200 bg-white md:hidden"><BoardNavigation mobile /></div><div className="mx-auto flex max-w-[1440px] items-start gap-7 px-4 py-7 sm:px-6 md:py-8 lg:gap-9 lg:px-10"><Sidebar /><main id="main-content" className="min-w-0 flex-1">{children}</main><CommunityPanel /></div></>;
}
