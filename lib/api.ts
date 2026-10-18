import { Prisma } from "@prisma/client";
import type { ZodType } from "zod";

type ParsedBody<T> = { data: T; error?: never } | { data?: never; error: Response };

export function apiError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export async function readJson<T>(request: Request, schema: ZodType<T>): Promise<ParsedBody<T>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: apiError("Invalid JSON", 400) };
  }

  const result = schema.safeParse(body);
  if (!result.success) {
    return { error: apiError(result.error.issues[0]?.message ?? "Invalid input", 400) };
  }

  return { data: result.data };
}

export function hasPrismaCode(error: unknown, code: string): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === code;
}
