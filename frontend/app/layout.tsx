import type { Metadata } from 'next';
import { Space_Grotesk, Space_Mono, Cinzel } from 'next/font/google';
import './globals.css';
import InviteBanner from './InviteBanner';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-grotesk',
  display: 'swap',
});

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
});

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['400', '700', '900'],
  variable: '--font-cinzel',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Focus Library',
  description: 'A 2D multiplayer study space for Indian exam aspirants',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${spaceMono.variable} ${cinzel.variable}`}>
      <body style={{ fontFamily: "var(--font-grotesk, 'Space Grotesk', system-ui, sans-serif)" }}>
        {children}
        <InviteBanner />
      </body>
    </html>
  );
}
