import { getServerSession } from "next-auth";
import { apiError, readJson } from "@/lib/api";
import { authOptions } from "@/lib/auth";
import { BOARD_SLUGS } from "@/lib/boards";
import { prisma } from "@/lib/db";
import { getPost, listPosts } from "@/lib/queries";
import { postSchema } from "@/lib/validators";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return apiError("Login required", 401);
    if (!session.user.username) return apiError("Choose a username first", 403);

    const query = new URL(request.url).searchParams;
    const board = query.get("board");
    const cursor = query.get("cursor");
    if (board !== null && !BOARD_SLUGS.some((slug) => slug === board)) {
      return apiError("Invalid board", 400);
    }
    if (cursor !== null && (cursor.trim().length === 0 || cursor.length > 128)) {
      return apiError("Invalid cursor", 400);
    }

    const page = await listPosts({
      viewerId: session.user.id,
      board: board ?? undefined,
      cursor: cursor ?? undefined,
    });
    return Response.json(page);
  } catch {
    return apiError("Something went wrong", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return apiError("Login required", 401);
    if (!session.user.username) return apiError("Choose a username first", 403);

    const body = await readJson(request, postSchema);
    if (body.error) return body.error;

    const post = await prisma.post.create({
      data: {
        title: body.data.title,
        body: body.data.body,
        board: body.data.board,
        userId: session.user.id,
      },
      select: { id: true },
    });
    const result = await getPost(post.id, session.user.id);
    if (!result) return apiError("Post not found", 404);

    return Response.json(result, { status: 201 });
  } catch {
    return apiError("Something went wrong", 500);
  }
}
