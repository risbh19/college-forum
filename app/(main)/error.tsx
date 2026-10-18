"use client";

import { Icon } from "@/components/ui/Icon";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-500"><Icon name="alert" /></span><h1 className="text-xl font-bold tracking-tight text-slate-800">We couldn’t load the conversation.</h1><p className="mx-auto mt-3 max-w-sm text-xs leading-6 text-slate-500">Please try again in a moment. If this continues, the site administrator may need to check the database connection.</p><button type="button" onClick={reset} className="mt-6 rounded-lg bg-indigo-600 px-5 py-3 text-xs font-semibold text-white transition hover:bg-indigo-700">Try again</button></section>;
}
