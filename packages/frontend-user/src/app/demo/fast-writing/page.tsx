import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Humanly Demo | Humanly',
  description: 'Try the Humanly task, writing, log, and certificate flow without signing in.',
};

export default function FastWritingDemoPage() {
  redirect('/documents/new?demo=1');
}
