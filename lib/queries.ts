import 'server-only';
import { BackendError, backendRequest } from './backend-client';
import type { CommentView, PaginatedPosts, PostSummary } from '@/types';

export async function listPosts({ viewerId, board, cursor }: { viewerId: string; board?: string; cursor?: string }): Promise<PaginatedPosts> {
  const query = new URLSearchParams();
  if (board) query.set('board', board);
  if (cursor) query.set('cursor', cursor);
  return backendRequest(viewerId, `/api/posts${query.size ? `?${query}` : ''}`);
}

export async function getPost(id: string, viewerId: string): Promise<PostSummary | null> {
  try { return await backendRequest(viewerId, `/api/posts/${encodeURIComponent(id)}`); }
  catch (error) { if (error instanceof BackendError && error.status === 404) return null; throw error; }
}

export async function listComments(postId: string, viewerId: string): Promise<CommentView[]> {
  const page = await backendRequest<{ comments: CommentView[] }>(viewerId, `/api/comments?${new URLSearchParams({ postId })}`);
  return page.comments;
}
