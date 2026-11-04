export type VoteValue = 'UP' | 'DOWN';
export type Author = { username: string };

export type PostSummary = {
  id: string;
  title: string;
  body: string;
  board: string;
  createdAt: string;
  author: Author;
  commentCount: number;
  score: number;
  myVote: VoteValue | null;
  isMine: boolean;
};

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  author: Author;
  isMine: boolean;
};

export type PaginatedPosts = { posts: PostSummary[]; nextCursor: string | null };
export type ModerationItem = { id: string; kind: 'posts' | 'comments'; title: string | null; body: string; hidden: boolean; reportCount: number; reasons: string[] };

export type AdminOverview = { members: number; suspendedMembers: number; posts: number; comments: number; hiddenPosts: number; hiddenComments: number; reportedItems: number };
export type AdminContentItem = { id: string; kind: 'posts' | 'comments'; postId: string; title: string; body: string; board: string; username: string; createdAt: string; hidden: boolean; parentHidden: boolean };
export type AdminContentPage = { items: AdminContentItem[]; hasMore: boolean };
export type AdminAccount = { username: string; createdAt: string; suspended: boolean; isAdmin: boolean };
export type AdminAccountsPage = { items: AdminAccount[]; hasMore: boolean };
