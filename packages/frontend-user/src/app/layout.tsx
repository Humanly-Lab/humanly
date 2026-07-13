import type { Metadata } from 'next';
import { Courier_Prime } from 'next/font/google';
import localFont from 'next/font/local';
import Script from 'next/script';
import { BRAND, getBrandText, hasFeature } from '@humanly/shared';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { PolyfillProvider } from '@/components/polyfill-provider';
import { getEdition } from '@/lib/edition';

const GOOGLE_ANALYTICS_MEASUREMENT_ID = 'G-3NKG61B682';

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
    process.env.NEXT_PUBLIC_MARKETING_ORIGIN || 'https://writehumanly.net'
  ),

  title: getBrandText().pageTitles.user,
  description:
    'Verify and certify human-written content through behavioral keystroke tracking...',
  keywords: [
    'human authorship',
    'authorship verification',
    'keystroke tracking',
  ],
  authors: [{ name: `${BRAND.name} Team` }],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon.png', type: 'image/png' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/favicon.ico',
  },

  openGraph: {
    title: getBrandText().pageTitles.user,
    description: 'Trustworthy environment for human-ai collaborative writing',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const edition = getEdition();

  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${cursorGothic.variable} ${courierPrime.variable}`}
        data-humanly-edition={edition}
      >
        {process.env.NEXT_PUBLIC_EDITION === 'cloud' &&
        hasFeature(edition, 'billing') ? (
          <span
            aria-hidden="true"
            data-humanly-cloud-ui="HUMANLY_CLOUD_UI_MARKER"
            hidden
          />
        ) : null}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ANALYTICS_MEASUREMENT_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ANALYTICS_MEASUREMENT_ID}');
          `}
        </Script>
        <PolyfillProvider>
          {children}
          <Toaster />
        </PolyfillProvider>
      </body>
    </html>
  );
}
