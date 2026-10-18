import { getServerSession } from "next-auth";
import { apiError, hasPrismaCode } from "@/lib/api";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getPost } from "@/lib/queries";

export const dynamic = "force-dynamic";

type Context = { params: { id: string } };

export async function GET(_request: Request, { params }: Context): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return apiError("Login required", 401);
    if (!session.user.username) return apiError("Choose a username first", 403);

    const post = await getPost(params.id, session.user.id);
    if (!post) return apiError("Post not found", 404);

    return Response.json(post);
  } catch {
    return apiError("Something went wrong", 500);
  }
}

export async function DELETE(_request: Request, { params }: Context): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return apiError("Login required", 401);
    if (!session.user.username) return apiError("Choose a username first", 403);

    const post = await prisma.post.findUnique({
      where: { id: params.id },
      select: { userId: true },
    });
    if (!post) return apiError("Post not found", 404);
    if (post.userId !== session.user.id) return apiError("Not your post", 403);

    await prisma.post.delete({
      where: { id: params.id, userId: session.user.id },
      select: { id: true },
    });

    return Response.json({ success: true });
  } catch (error: unknown) {
    if (hasPrismaCode(error, "P2025")) return apiError("Post not found", 404);
    return apiError("Something went wrong", 500);
  }
}
