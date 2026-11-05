'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { reportSchema } from '@/lib/validators';

export default function ReportButton({ postId, commentId }: { postId?: string; commentId?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [reason, setReason] = useState('Harassment or bullying');
  const [error, setError] = useState('');
  const id = useId();
  const router = useRouter();
  async function report(event: React.FormEvent) {
    event.preventDefault();
    const parsed = reportSchema.safeParse({ postId, commentId, reason });
    if (!parsed.success) { setError('Choose a reason for this report.'); return; }
    setPending(true); setError('');
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not send report.');
      setSent(true); setOpen(false); router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not send report.'); }
    finally { setPending(false); }
  }
  return <div className="mt-2 text-sm">
    {sent ? <p role="status" className="text-muted">Report submitted</p> : <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)} className="rounded px-2 py-1 text-muted hover:bg-slate-100">Report</button>}
    {open && <form id={id} onSubmit={report} className="mt-2 space-y-2 rounded-lg border border-line bg-canvas p-3">
      <label htmlFor={`${id}-reason`} className="block font-medium text-ink">Reason for reporting</label>
      <select id={`${id}-reason`} value={reason} disabled={pending} onChange={event => setReason(event.target.value)} aria-describedby={error ? `${id}-error` : undefined} className="w-full rounded-xl border border-control bg-white p-3 text-base">
        {['Harassment or bullying', 'Spam or misleading content', 'Threats or harmful content', 'Sharing personal information'].map(value => <option key={value}>{value}</option>)}
      </select>
      <p className="text-muted">Three distinct reports hide content for moderator review.</p>
      <div className="flex flex-wrap gap-3"><button disabled={pending} className="rounded-xl bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50">{pending ? 'Submitting…' : 'Submit report'}</button><button type="button" disabled={pending} onClick={() => setOpen(false)} className="rounded-xl px-3 py-2 text-muted hover:bg-white">Cancel</button></div>
    </form>}
    {error && <p id={`${id}-error`} role="alert" className="mt-2 text-red-700">{error}</p>}
  </div>;
}
