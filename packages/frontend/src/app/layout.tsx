import type { Metadata } from 'next';
import { Courier_Prime } from 'next/font/google';
import localFont from 'next/font/local';
import { BRAND, getBrandText } from '@humanly/shared';
import './globals.css';

const cursorGothic = localFont({
  src: [
    {
      path: '../../public/fonts/cursor-gothic/CursorGothic-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/cursor-gothic/CursorGothic-Italic.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../../public/fonts/cursor-gothic/CursorGothic-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../public/fonts/cursor-gothic/CursorGothic-BoldItalic.woff2',
      weight: '700',
      style: 'italic',
    },
  ],
  variable: '--font-humanly-sans',
  display: 'swap',
});

const courierPrime = Courier_Prime({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-humanly-brand',
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  ),
  title: getBrandText().pageTitles.admin,
  description:
    'A comprehensive text input provenance tracking and analysis platform',
  keywords: [
    'text tracking',
    'keystroke analytics',
    'form analytics',
    'survey tracking',
  ],
  authors: [{ name: `${BRAND.name} Team` }],
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: getBrandText().pageTitles.admin,
    description:
      'A comprehensive text input provenance tracking and analysis platform',
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
      <body className={`${cursorGothic.variable} ${courierPrime.variable}`}>
        {children}
      </body>
    </html>
  );
}
