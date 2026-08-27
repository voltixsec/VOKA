import "./globals.css";
import type { Metadata } from "next";
import { Cairo, IBM_Plex_Sans_Arabic } from "next/font/google";

const vokaFont = IBM_Plex_Sans_Arabic({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-voka",
});
const cairo = Cairo({ subsets: ["arabic", "latin"], variable: "--font-cairo", display: "swap" });

export const metadata: Metadata = {
  title: "VOKA — Speak. Understand. Quote.",
  description:
    "Voice-first commercial operations for governed bilingual quotations, sales orders, invoices, and payments.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body
        className={`${vokaFont.variable} ${cairo.variable}`}
        suppressHydrationWarning
      >
        {children}
      </body>
    </html>
  );
}

