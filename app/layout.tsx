import type { Metadata, Viewport } from 'next';
import IntroVideo from '@/components/IntroVideo';
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
    statusBarStyle: 'default',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
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
  themeColor: '#fbf5ec',
};

/**
 * Read before the browser paints: a visitor who has already seen the title card
 * gets the planner and nothing else. The curtain is sent from the server, so
 * only a blocking script in the head can keep it from flashing up; hiding it
 * here also stops its still frame from ever being fetched. The key matches
 * INTRO_SEEN_KEY in src/components/IntroVideo.tsx.
 */
const INTRO_SEEN_SCRIPT =
  "try{if(localStorage.getItem('introSeen')==='1')" +
  "{document.documentElement.setAttribute('data-intro-seen','1')}}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: INTRO_SEEN_SCRIPT }} />
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
        <IntroVideo />
        <ServiceWorker />
      </body>
    </html>
  );
}
