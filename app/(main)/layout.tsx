import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import Navbar from "@/components/ui/Navbar";
import Sidebar from "@/components/layout/Sidebar";
import BoardNavigation from "@/components/layout/BoardNavigation";
import CommunityPanel from "@/components/layout/CommunityPanel";
import { Icon } from "@/components/ui/Icon";
import { isLocalDemo } from "@/lib/local-mode";
import { BackendError, backendRequest } from "@/lib/backend-client";

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const localDemo = isLocalDemo();
  const session = await getServerSession(authOptions);
  if (!session?.user.id) redirect("/login");
  if (!session.user.username) redirect("/setup-username");
  let isAdmin = false;
  try { ({ isAdmin } = await backendRequest<{ isAdmin: boolean }>(session.user.id, '/api/admin/status')); }
  catch (error) {
    if (error instanceof BackendError && error.status === 403 && error.message === 'Your account is suspended') redirect('/suspended');
    throw error;
  }
  return <><a href="#main-content" className="sr-only z-50 rounded-lg bg-indigo-600 px-4 py-3 text-sm text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a><Navbar isAdmin={isAdmin} />{localDemo && <div role="note" className="md:sticky md:top-[76px] z-20 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm leading-5 text-amber-900"><span className="inline-flex items-center justify-center gap-1.5 font-semibold"><Icon name="alert" className="h-3.5 w-3.5" />Local demo</span><span className="mx-2 text-amber-300" aria-hidden="true">·</span>Saved in this project folder<span className="mx-2 text-amber-300" aria-hidden="true">·</span>Shared accounts are not private. Switch accounts by logging out.</div>}<div className="border-b border-line bg-white md:hidden"><BoardNavigation mobile /></div><div className={`mx-auto flex max-w-[1440px] items-start gap-6 px-4 py-6 sm:px-6 md:py-8 lg:gap-8 lg:px-10 ${localDemo ? "[&>aside:first-child]:top-[148px]" : ""}`}><Sidebar /><main id="main-content" tabIndex={-1} className="min-w-0 flex-1 pb-8">{children}</main><CommunityPanel /></div></>;
}
