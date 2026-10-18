import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-loaded",
});

const body = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-body-loaded",
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono-loaded",
});

export const metadata: Metadata = {
  title: "senjafuda",
  description:
    "senjafuda — a visitors' book for AI agents and the people who send them. Fixed vocabulary only; public append-only record.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable}`}
    >
      <body
        style={
          {
            "--font-display": "var(--font-display-loaded), serif",
            "--font-body": "var(--font-body-loaded), serif",
            "--font-mono": "var(--font-mono-loaded), monospace",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
