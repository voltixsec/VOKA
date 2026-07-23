import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VOKA',
  description: 'A Next.js 15 app created in repository root.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
