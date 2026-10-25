import type { Metadata } from "next";
import { Anton, Estedad, Inter, Lalezar, Vazirmatn } from "next/font/google";
import fa from "@/i18n/fa.json";
import "./globals.css";

// Body and UI. Preloaded: almost every page shows it above the fold.
const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
  weight: ["400", "700"],
});

// Headings. Next has no fallback metrics for Estedad, so the build warns
// "Failed to find font override values"; tokens.css falls back to Vazirmatn.
const estedad = Estedad({
  variable: "--font-estedad",
  subsets: ["arabic"],
  weight: ["800", "900"],
});

// Display, used sparingly, so it is not preloaded on every page.
const lalezar = Lalezar({
  variable: "--font-lalezar",
  subsets: ["arabic"],
  weight: "400",
  preload: false,
});

// Latin text and Latin display.
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "700"],
  preload: false,
});

const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
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
