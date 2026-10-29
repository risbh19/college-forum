import { adminLoginPolicy } from './access-policy';
import { backendRequest } from './backend-client';
import { adminLoginSchema } from './admin-login-schema';

export async function authorizeAdmin(credentials: unknown): Promise<{ id: string } | null> {
  if (!adminLoginPolicy()) return null;
  const input = adminLoginSchema.safeParse(credentials);
  if (!input.success) return null;
  const id = process.env.ADMIN_LOGIN_ACCOUNT_ID!;
  try {
    await backendRequest<{ username: string }>(id, '/internal/admin-login', 'POST', JSON.stringify(input.data), 'admin-login');
    return { id };
  } catch { return null; }
}
