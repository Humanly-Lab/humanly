import { redirect } from 'next/navigation';

interface EnrollmentsRedirectPageProps {
  params: {
    id: string;
  };
}

export default function EnrollmentsRedirectPage({ params }: EnrollmentsRedirectPageProps) {
  redirect(`/tasks/${params.id}?tab=users`);
}
