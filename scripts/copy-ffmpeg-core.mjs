// Copies the single-thread ffmpeg core from node_modules into public/ffmpeg/ so
// the app serves it from its own origin. Runs as "postinstall" (local, npm ci, Vercel).
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "node_modules", "@ffmpeg", "core", "dist", "esm");
const destDir = join(root, "public", "ffmpeg");
const files = ["ffmpeg-core.js", "ffmpeg-core.wasm"];

mkdirSync(destDir, { recursive: true });

for (const name of files) {
  const src = join(srcDir, name);
  const dest = join(destDir, name);
  if (!existsSync(src)) {
    console.error(`[copy-ffmpeg-core] missing ${src}; is @ffmpeg/core installed?`);
    process.exit(1);
  }
  if (existsSync(dest) && statSync(dest).size === statSync(src).size) {
    console.log(`[copy-ffmpeg-core] ${name} already up to date`);
    continue;
  }
  copyFileSync(src, dest);
  console.log(`[copy-ffmpeg-core] copied ${name}`);
}
