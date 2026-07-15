import { redirect } from 'next/navigation';
import { buildFrontendUserAuthUrl } from '@/lib/certificate-url';

interface LoginRedirectPageProps {
  searchParams?: {
    next?: string | string[];
  };
}

export default function LoginRedirectPage({ searchParams }: LoginRedirectPageProps) {
  const requestedNext = Array.isArray(searchParams?.next)
    ? searchParams?.next[0]
    : searchParams?.next;

  redirect(buildFrontendUserAuthUrl('login', requestedNext));
}
