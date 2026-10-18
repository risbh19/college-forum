import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">404</p>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Nothing here just yet.</h1>
      <p className="mt-3 text-slate-600">This board or post could not be found. The post may have been deleted.</p>
      <Link href="/" className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-700">Back to the forum</Link>
    </main>
  );
}
