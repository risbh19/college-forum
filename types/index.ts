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

export type PostsPage = { posts: PostSummary[]; nextCursor: string | null };
export type PaginatedPosts = PostsPage;
export type ModerationItem = { id: string; kind: 'posts' | 'comments'; title: string | null; body: string; hidden: boolean; reportCount: number; reasons: string[] };
