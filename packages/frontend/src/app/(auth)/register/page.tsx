import { redirect } from 'next/navigation';
import { buildFrontendUserAuthUrl } from '@/lib/certificate-url';

interface RegisterRedirectPageProps {
  searchParams?: {
    next?: string | string[];
  };
}

export default function RegisterRedirectPage({ searchParams }: RegisterRedirectPageProps) {
  const requestedNext = Array.isArray(searchParams?.next)
    ? searchParams?.next[0]
    : searchParams?.next;

  redirect(buildFrontendUserAuthUrl('register', requestedNext));
}
