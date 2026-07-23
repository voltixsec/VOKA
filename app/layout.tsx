import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'VOKA — Your AI Sales Employee',
  description: 'Turn conversations into professional quotations in seconds using AI with VOKA.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
