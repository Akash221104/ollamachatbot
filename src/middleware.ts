import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyToken } from './lib/auth';

export async function middleware(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  const session = token ? await verifyToken(token) : null;
  const { pathname } = req.nextUrl;

  // Protect Admin dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    if (session.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/chat', req.url));
    }
  }

  // Protect User routes
  if (pathname === '/chat' || pathname === '/profile') {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  // Redirect authenticated users away from Login page
  if (pathname === '/login') {
    if (session) {
      if (session.role === 'ADMIN') {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      } else {
        return NextResponse.redirect(new URL('/chat', req.url));
      }
    }
  }

  // Handle Root route redirection
  if (pathname === '/') {
    if (!session) {
      return NextResponse.redirect(new URL('/login', req.url));
    }
    if (session.role === 'ADMIN') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    } else {
      return NextResponse.redirect(new URL('/chat', req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/login', '/chat', '/profile', '/dashboard/:path*'],
};
