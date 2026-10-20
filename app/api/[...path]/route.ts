import { createForumProxy } from '@/lib/forum-proxy';

export const dynamic = 'force-dynamic';
const proxy = createForumProxy();
export { proxy as GET, proxy as POST, proxy as DELETE, proxy as PATCH };
