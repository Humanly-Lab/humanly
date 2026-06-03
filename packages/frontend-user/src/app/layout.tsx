import type { Metadata } from 'next';
import { Courier_Prime, Inter } from 'next/font/google';
import Script from 'next/script';
import { BRAND, getBrandText } from '@humanly/shared';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { PolyfillProvider } from '@/components/polyfill-provider';

const GOOGLE_ANALYTICS_MEASUREMENT_ID = 'G-3NKG61B682';

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
  metadataBase: new URL('http://localhost:3002'),

  title: getBrandText().pageTitles.user,
  description: 'Verify and certify human-written content through behavioral keystroke tracking...',
  keywords: ['human authorship', 'authorship verification', 'keystroke tracking'],
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${courierPrime.variable}`}>
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
