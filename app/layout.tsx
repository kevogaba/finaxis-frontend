import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { AppProviders } from '@/components/providers/app-providers';
import { DARK, LIGHT } from '@/theme/tokens';
import './globals.css';

// No `weight` option: the theme uses weights (650/750/800) outside the 400-700 range a fixed
// weight list would cover, and Inter is a variable font — next/font/google docs (see
// node_modules/next/dist/docs/01-app/03-api-reference/02-components/font.md) load the full
// weight axis when `weight` is omitted.
const inter = Inter({
  variable: '--font-finaxis',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: {
    default: 'Finaxis',
    template: '%s — Finaxis',
  },
  description: 'Modern financial operations for member-based institutions.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: LIGHT.background.default },
    { media: '(prefers-color-scheme: dark)', color: DARK.background.default },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <InitColorSchemeScript attribute="class" defaultMode="system" />
        <AppRouterCacheProvider options={{ enableCssLayer: true }}>
          <AppProviders>{children}</AppProviders>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
