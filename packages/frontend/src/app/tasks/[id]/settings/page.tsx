import { redirect } from 'next/navigation';

interface SettingsRedirectPageProps {
  params: {
    id: string;
  };
}

export default function SettingsRedirectPage({ params }: SettingsRedirectPageProps) {
  redirect(`/tasks/${params.id}?tab=setting`);
}
