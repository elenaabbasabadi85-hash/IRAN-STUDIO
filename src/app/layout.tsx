import type { Metadata } from "next";
import fa from "@/i18n/fa.json";
import { fontVariables } from "@/styles/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: fa.meta.title,
  description: fa.meta.description,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fa" dir="rtl" className={`${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background font-body text-body text-foreground">
        {children}
      </body>
    </html>
  );
}
