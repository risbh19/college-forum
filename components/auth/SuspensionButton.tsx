'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function SuspensionButton({ username, suspended }: { username: string; suspended: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  async function update() {
    if (!window.confirm(suspended ? `Restore forum access for u/${username}?` : `Suspend u/${username}? They will lose forum access until restored. Their content will remain.`)) return;
    setPending(true); setError('');
    try {
      const response = await fetch(`/api/admin/accounts/${encodeURIComponent(username)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ suspended: !suspended }),
      });
      const data: { error?: string } = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not update account.');
      router.refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Could not update account.'); }
    finally { setPending(false); }
  }
  return <div className="space-y-2"><button type="button" disabled={pending} onClick={update} className={`rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 ${suspended ? 'border-indigo-200 text-indigo-700' : 'border-red-200 text-red-700'}`}>{pending ? 'Saving…' : suspended ? 'Restore access' : 'Suspend'}</button>{error && <p role="alert" className="text-sm text-red-600">{error}</p>}</div>;
}
