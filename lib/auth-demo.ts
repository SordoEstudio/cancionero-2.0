/**
 * Modo demo local: sin login, para probar UI y flujos.
 * Activar solo con AUTH_DEMO_MODE=true en .env.local (nunca en producción).
 */

export function isAuthDemoMode(): boolean {
  if (process.env.AUTH_DEMO_MODE !== 'true') return false;
  if (process.env.NODE_ENV === 'production') {
    if (process.env.AUTH_DEMO_ALLOW_PRODUCTION === 'true') return true;
    return false;
  }
  return true;
}

/** UUID válido en .env para asociar importaciones/versiones al usuario demo (Auth real). */
export function getDemoUserId(): string | undefined {
  const id = process.env.DEMO_USER_ID?.trim();
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    return undefined;
  }
  return id;
}
