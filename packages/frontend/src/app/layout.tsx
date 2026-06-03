import type { Metadata } from 'next';
import { Courier_Prime, Inter } from 'next/font/google';
import { BRAND, getBrandText } from '@humanly/shared';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-humanly-sans',
});

const courierPrime = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-humanly-brand',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'),
  title: getBrandText().pageTitles.admin,
  description: 'A comprehensive text input provenance tracking and analysis platform',
  keywords: ['text tracking', 'keystroke analytics', 'form analytics', 'survey tracking'],
  authors: [{ name: `${BRAND.name} Team` }],
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: getBrandText().pageTitles.admin,
    description: 'A comprehensive text input provenance tracking and analysis platform',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${courierPrime.variable}`}>
        {children}
      </body>
    </html>
  );
}
