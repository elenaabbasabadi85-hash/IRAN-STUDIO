import type { Metadata } from "next";
import localFont from "next/font/local";
import fa from "@/i18n/fa.json";
import "./globals.css";

// The brand fonts are served from the project (src/styles/fonts, with their licenses), so the
// build never fetches from Google. The files are the versions Google Fonts serves.
//
// The variable fonts are declared at the same single weights Google Fonts declared, not as a
// 100–900 range: other weights (font-medium, font-semibold) keep snapping to the nearest one.
// next/font reads these options at build time, so they stay written out as literals.

// Body and UI. Preloaded: almost every page shows it above the fold.
const vazirmatn = localFont({
  src: [
    { path: "../styles/fonts/vazirmatn/Vazirmatn-Variable.woff2", weight: "400" },
    { path: "../styles/fonts/vazirmatn/Vazirmatn-Variable.woff2", weight: "700" },
  ],
  variable: "--font-vazirmatn",
  display: "swap",
});

// Headings.
const estedad = localFont({
  src: [
    { path: "../styles/fonts/estedad/Estedad-Variable.woff2", weight: "800" },
    { path: "../styles/fonts/estedad/Estedad-Variable.woff2", weight: "900" },
  ],
  variable: "--font-estedad",
  display: "swap",
});

// Display, used sparingly, so it is not preloaded on every page.
const lalezar = localFont({
  src: "../styles/fonts/lalezar/Lalezar-Regular.woff2",
  variable: "--font-lalezar",
  weight: "400",
  display: "swap",
  preload: false,
});

// Latin text and Latin display.
const inter = localFont({
  src: [
    { path: "../styles/fonts/inter/Inter-Variable.woff2", weight: "400" },
    { path: "../styles/fonts/inter/Inter-Variable.woff2", weight: "700" },
  ],
  variable: "--font-inter",
  display: "swap",
  preload: false,
});

const anton = localFont({
  src: "../styles/fonts/anton/Anton-Regular.woff2",
  variable: "--font-anton",
  weight: "400",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: fa.meta.title,
  description: fa.meta.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fa"
      dir="rtl"
      className={`${vazirmatn.variable} ${estedad.variable} ${lalezar.variable} ${inter.variable} ${anton.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background font-body text-body text-foreground">
        {children}
      </body>
    </html>
  );
}
