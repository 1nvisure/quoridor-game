import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Quoridor — Play Bots & Review Your Game',
  description:
    'A polished Quoridor client with three bot opponents, BFS-validated wall placement and a full post-game review engine.',
  applicationName: 'Quoridor',
};

export const viewport: Viewport = {
  themeColor: '#121212',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
