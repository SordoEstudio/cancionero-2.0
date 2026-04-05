import { createServerClient, type SetAllCookies } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { isAuthDemoMode } from '@/lib/auth-demo';

const PROTECTED_PATHS = [
  '/song/',
  '/api/save-version',
  '/api/version/',
  '/api/songs',
  '/api/versions',
  '/api/import-song',
];

function pathRequiresAuth(pathname: string): boolean {
  if (pathname === '/') return true;
  return PROTECTED_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  if (isAuthDemoMode()) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;

  const response = NextResponse.next({
    request: { headers: request.headers },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Parameters<SetAllCookies>[0]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session && pathRequiresAuth(pathname)) {
    const loginUrl = new URL('/auth/login', request.url);
    loginUrl.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
