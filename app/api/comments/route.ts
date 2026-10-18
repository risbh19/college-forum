import { getServerSession } from "next-auth";
import { apiError, hasPrismaCode, readJson } from "@/lib/api";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { listComments } from "@/lib/queries";
import { commentSchema } from "@/lib/validators";
import type { CommentView } from "@/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return apiError("Login required", 401);
    if (!session.user.username) return apiError("Choose a username first", 403);

    const postId = new URL(request.url).searchParams.get("postId");
    if (!postId?.trim() || postId.length > 128) return apiError("A valid postId is required", 400);

    return Response.json({ comments: await listComments(postId, session.user.id) });
  } catch {
    return apiError("Something went wrong", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return apiError("Login required", 401);
    if (!session.user.username) return apiError("Choose a username first", 403);

    const body = await readJson(request, commentSchema);
    if (body.error) return body.error;

    const post = await prisma.post.findUnique({
      where: { id: body.data.postId },
      select: { id: true },
    });
    if (!post) return apiError("Post not found", 404);

    const comment = await prisma.comment.create({
      data: { postId: body.data.postId, body: body.data.body, userId: session.user.id },
      select: {
        id: true,
        body: true,
        createdAt: true,
        user: { select: { username: true } },
      },
    });
    const result: CommentView = {
      id: comment.id,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      author: { username: comment.user.username },
      isMine: true,
    };

    return Response.json(result, { status: 201 });
  } catch (error: unknown) {
    if (hasPrismaCode(error, "P2003")) return apiError("Post not found", 404);
    return apiError("Something went wrong", 500);
  }
}
