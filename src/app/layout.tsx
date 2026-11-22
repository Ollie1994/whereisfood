import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "@/app/globals.css";
import { SITE_TITLE, pageTitle } from "@/lib/titles";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // A page in a child segment sets only its name ("Om", "Karta"); the root not-found and the
  // error pages build theirs (`src/lib/titles.ts`).
  title: { default: SITE_TITLE, template: pageTitle("%s") },
  description: "Se var Göteborgs foodtruckar befinner sig just nu.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="sv"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
