import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hasFeature } from '@humanly/shared';
import BillingSettingsPage from '@humanly-edition/billing-ui';
import { Navbar } from '@/components/navigation/navbar';
import { getEdition } from '@/lib/edition';

export const metadata: Metadata = {
  title: 'Billing — Humanly',
};

export const dynamic = 'force-dynamic';

export default function BillingPage() {
  const edition = getEdition();

  if (
    process.env.NEXT_PUBLIC_EDITION !== 'cloud' ||
    !hasFeature(edition, 'billing')
  ) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <BillingSettingsPage />
      </main>
    </div>
  );
}
