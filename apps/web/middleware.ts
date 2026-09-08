import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Static assets and Next.js internals are always allowed
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname === '/favicon.ico' ||
    /\.(.*)$/.test(pathname)
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get('vajra_session');
  const hasSession = Boolean(sessionCookie?.value);

  // If user is on /login and already has a session, redirect to workbench home
  if (pathname === '/login') {
    if (hasSession) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // If user is not on /login and has no session, redirect to /login
  if (!hasSession) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
