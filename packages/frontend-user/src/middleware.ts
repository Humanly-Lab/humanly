import { NextResponse, type NextRequest } from 'next/server';
import { getApexRedirectLocation } from '@/lib/apex-routing';

export function middleware(request: NextRequest) {
  const location = getApexRedirectLocation(
    request.headers.get('host'),
    request.nextUrl.pathname,
    request.nextUrl.search
  );

  if (!location) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(location), 308);
}

export const config = {
  matcher: '/:path*',
};
