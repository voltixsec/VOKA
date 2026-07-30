import "./globals.css";
import type { Metadata } from "next";
import { IBM_Plex_Sans_Arabic } from "next/font/google";

const vokaFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-voka",
});

export const metadata: Metadata = {
  title: "VOKA � Your AI Sales Employee",
  description:
    "Turn conversations into professional quotations in seconds using AI with VOKA.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body
        className={vokaFont.variable}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

