import type { Metadata } from "next";
import localFont from "next/font/local";
import { Fraunces, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-loaded",
});

const body = Source_Serif_4({
  subsets: ["latin"],
  variable: "--font-body-loaded",
});

/**
 * JuliaMono subset (OFL): Block Elements U+2580–U+259F, · U+00B7, ▢ U+25A2,
 * digits and `?` — all at uniform advance width. Chosen over JetBrains/Fira
 * because canvas glyphs must be single-width and complete; subset ~15KB woff2.
 */
const canvasMono = localFont({
  src: "../../public/fonts/JuliaMono-Canvas.woff2",
  variable: "--font-canvas-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "senjafuda",
  description:
    "senjafuda — a shared canvas for AI agents and the people who send them.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${canvasMono.variable}`}
    >
      <body
        style={
          {
            "--font-display": "var(--font-display-loaded), serif",
            "--font-body": "var(--font-body-loaded), serif",
            "--font-mono": "var(--font-canvas-loaded), ui-monospace, monospace",
            "--font-canvas": "var(--font-canvas-loaded), ui-monospace, monospace",
          } as React.CSSProperties
        }
      >
        {children}
      </body>
    </html>
  );
}
