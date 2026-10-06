import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "plantOS Industrial AI", template: "%s · plantOS" },
  description: "Local-first Industrial AI für Abfüll- und Verpackungslinien. READ ONLY gegenüber Maschinen.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0e14", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans`}>{children}</body>
    </html>
  );
}
