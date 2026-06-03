import { redirect } from 'next/navigation';

interface AnalyticsRedirectPageProps {
  params: {
    id: string;
  };
}

export default function AnalyticsRedirectPage({ params }: AnalyticsRedirectPageProps) {
  redirect(`/tasks/${params.id}?tab=analytics`);
}
