import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { getDemoUserId, isAuthDemoMode } from '@/lib/auth-demo';

type AuthOk = { userId: string; isDemo: boolean };
type AuthErr = { error: string; status: number };

/**
 * Resuelve el userId actual (demo o autenticado).
 * Usar en API routes para eliminar boilerplate de auth.
 */
export async function getApiUserId(): Promise<AuthOk | AuthErr> {
  if (isAuthDemoMode()) {
    const demoId = getDemoUserId();
    if (!demoId) return { error: 'Demo sin DEMO_USER_ID', status: 403 };
    return { userId: demoId, isDemo: true };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'No autenticado', status: 401 };
  return { userId: user.id, isDemo: false };
}

export function isAuthOk(r: AuthOk | AuthErr): r is AuthOk {
  return 'userId' in r;
}
