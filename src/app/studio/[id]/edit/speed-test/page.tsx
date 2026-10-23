import type { Metadata } from "next";
import t from "@/video/benchmark/strings.fa.json";
import SpeedTestClient from "./SpeedTestClient";

// Temporary benchmark page for the ffmpeg.wasm speed-test issue.
// COOP/COEP for multi-thread mode are set for this path in next.config.ts.
export const metadata: Metadata = {
  title: t.title,
  robots: { index: false, follow: false },
};

export default function SpeedTestPage() {
  return <SpeedTestClient />;
}
