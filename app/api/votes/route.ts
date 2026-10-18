import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { apiError, hasPrismaCode, readJson } from "@/lib/api";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getVoteState } from "@/lib/queries";
import { voteSchema } from "@/lib/validators";
import type { VoteValue } from "@/types";

async function toggleVote(postId: string, userId: string, type: VoteValue) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const post = await transaction.post.findUnique({
          where: { id: postId },
          select: { id: true },
        });
        if (!post) return null;

        const key = { userId_postId: { userId, postId } };
        const existing = await transaction.vote.findUnique({
          where: key,
          select: { type: true },
        });

        if (!existing) {
          await transaction.vote.create({ data: { userId, postId, type }, select: { type: true } });
        } else if (existing.type === type) {
          await transaction.vote.delete({ where: key, select: { type: true } });
        } else {
          await transaction.vote.update({ where: key, data: { type }, select: { type: true } });
        }

        return getVoteState(postId, userId, transaction);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: unknown) {
      const retryable = hasPrismaCode(error, "P2034") || hasPrismaCode(error, "P2002");
      if (!retryable || attempt === 3) throw error;
    }
  }

  throw new Error("Unable to update vote");
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return apiError("Login required", 401);
    if (!session.user.username) return apiError("Choose a username first", 403);

    const body = await readJson(request, voteSchema);
    if (body.error) return body.error;

    const state = await toggleVote(body.data.postId, session.user.id, body.data.type);
    if (!state) return apiError("Post not found", 404);

    return Response.json(state);
  } catch (error: unknown) {
    if (hasPrismaCode(error, "P2003")) return apiError("Post not found", 404);
    return apiError("Something went wrong", 500);
  }
}
