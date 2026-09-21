import type { Metadata, Viewport } from 'next';
import ServiceWorker from '@/components/ServiceWorker';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trip Planner',
  description: 'Map-first itinerary, routing and budget planner.',
  applicationName: 'Trip Planner',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Trip',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  formatDetection: { telephone: false, date: false, address: false, email: false },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // The map runs edge to edge; the layout pads itself with the safe-area insets.
  viewportFit: 'cover',
  themeColor: '#161826',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css"
        />
        <link
          rel="stylesheet"
          href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/fill/style.css"
        />
      </head>
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
