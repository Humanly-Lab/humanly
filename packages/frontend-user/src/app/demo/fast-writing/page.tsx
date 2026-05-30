import type { Metadata } from 'next';
import { FastWritingDemo } from '@/components/demo/fast-writing-demo';

export const metadata: Metadata = {
  title: 'Humanly Demo | Humanly',
  description: 'Try the Humanly task, writing, log, and certificate flow without signing in.',
};

export default function FastWritingDemoPage() {
  return (
    <main className="min-h-screen bg-[#f7f2e8] text-foreground">
      <FastWritingDemo />
    </main>
  );
}
