import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CommentView, PaginatedPosts, PostSummary, VoteValue } from "@/types";

const postSelect = {
  id: true,
  title: true,
  body: true,
  board: true,
  createdAt: true,
  userId: true,
  user: { select: { username: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.PostSelect;

const commentSelect = {
  id: true,
  body: true,
  createdAt: true,
  userId: true,
  user: { select: { username: true } },
} satisfies Prisma.CommentSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;
type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;
type QueryClient = Pick<Prisma.TransactionClient, "vote">;
type VoteState = { score: number; myVote: VoteValue | null };

function toPostSummary(row: PostRow, viewerId: string, vote: VoteState): PostSummary {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    board: row.board,
    createdAt: row.createdAt.toISOString(),
    author: { username: row.user.username },
    commentCount: row._count.comments,
    score: vote.score,
    myVote: vote.myVote,
    isMine: row.userId === viewerId,
  };
}

function toCommentView(row: CommentRow, viewerId: string): CommentView {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { username: row.user.username },
    isMine: row.userId === viewerId,
  };
}

async function voteStates(
  postIds: string[],
  viewerId: string,
  client: QueryClient = prisma,
): Promise<Map<string, VoteState>> {
  const states = new Map<string, VoteState>(postIds.map((id) => [id, { score: 0, myVote: null }]));
  if (postIds.length === 0) return states;

  const [totals, mine] = await Promise.all([
    client.vote.groupBy({
      by: ["postId", "type"],
      where: { postId: { in: postIds } },
      _count: { _all: true },
    }),
    client.vote.findMany({
      where: { userId: viewerId, postId: { in: postIds } },
      select: { postId: true, type: true },
    }),
  ]);

  for (const total of totals) {
    const state = states.get(total.postId);
    if (state) state.score += total.type === "UP" ? total._count._all : -total._count._all;
  }

  for (const vote of mine) {
    const state = states.get(vote.postId);
    if (state) state.myVote = vote.type;
  }

  return states;
}

export async function listPosts({
  viewerId,
  board,
  cursor,
}: {
  viewerId: string;
  board?: string;
  cursor?: string;
}): Promise<PaginatedPosts> {
  const rows = await prisma.post.findMany({
    where: board ? { board } : undefined,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 21,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: postSelect,
  });
  const page = rows.slice(0, 20);
  const states = await voteStates(page.map((row) => row.id), viewerId);

  return {
    posts: page.map((row) => toPostSummary(row, viewerId, states.get(row.id) ?? { score: 0, myVote: null })),
    nextCursor: rows.length > 20 ? page[19].id : null,
  };
}

export async function getPost(id: string, viewerId: string): Promise<PostSummary | null> {
  const row = await prisma.post.findUnique({ where: { id }, select: postSelect });
  if (!row) return null;

  return toPostSummary(row, viewerId, await getVoteState(id, viewerId));
}

export async function listComments(postId: string, viewerId: string): Promise<CommentView[]> {
  const rows = await prisma.comment.findMany({
    where: { postId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: commentSelect,
  });

  return rows.map((row) => toCommentView(row, viewerId));
}

export async function getVoteState(
  postId: string,
  viewerId: string,
  client: QueryClient = prisma,
): Promise<VoteState> {
  const states = await voteStates([postId], viewerId, client);
  return states.get(postId) ?? { score: 0, myVote: null };
}
