import { getServerSession } from "next-auth";
import { z } from "zod";
import { apiError, hasPrismaCode, readJson } from "@/lib/api";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { usernameSchema } from "@/lib/validators";

const bodySchema = z.object({ username: usernameSchema });

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user.id) return apiError("Login required", 401);
    if (session.user.username) return apiError("Username already set", 409);

    const body = await readJson(request, bodySchema);
    if (body.error) return body.error;

    const existing = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true },
    });
    if (existing) return apiError("Username already set", 409);

    try {
      const user = await prisma.user.create({
        data: {
          id: session.user.id,
          username: body.data.username,
          usernameLower: body.data.username.toLowerCase(),
        },
        select: { username: true },
      });

      return Response.json({ username: user.username });
    } catch (error: unknown) {
      if (hasPrismaCode(error, "P2002")) {
        const account = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { username: true },
        });
        return apiError(account ? "Username already set" : "Username already taken", 409);
      }
      throw error;
    }
  } catch {
    return apiError("Something went wrong", 500);
  }
}
