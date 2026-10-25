<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Team rules for AI assistants

### Language

- Always reply to the user in Persian (Farsi).

### Project

"Iran Studio" is a Persian, right-to-left web app for YouTubers. Stack: Next.js App Router, TypeScript and Tailwind CSS, deployed on Vercel.

### Lanes and folder ownership

Only edit files in the current user's lane. If you are not sure which lane the user owns, ask.

- **Content lane (Alireza):** `src/agents`, `prompts`, `src/persian`, `fixtures`, `src/app/studio/[id]/idea`, `src/app/studio/[id]/script`, `src/app/studio/[id]/write`, `src/app/api/agents`, `src/app/api/trends`.
- **Video lane (Elena):** `src/video`, `src/app/studio/[id]/record`, `src/app/studio/[id]/edit`, `src/app/api/transcribe`, `src/app/lab`.
- **Platform lane (Mahboubeh):** `src/components`, `src/styles`, `src/storage`, `src/i18n`, `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/pricing`, `src/app/ui`, `src/app/studio/page.tsx`, `src/app/studio/new`, `src/app/studio/[id]/page.tsx`, `src/app/studio/[id]/layout.tsx`, `src/app/studio/[id]/publish`, `.github`, `docs`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `next.config.ts` and the other root config files.
- **Shared:** changes to `src/core` need approval from all three. `package.json` and `package-lock.json` may change when anyone installs a package.

### Git

- Never commit directly to `main`.
- One branch per task, named `feat/<lane>-<topic>`, `fix/<topic>` or `chore/<topic>`.
- Commit messages follow Conventional Commits, in English.
- Keep pull requests small, with a Persian description and `Closes #<issue number>`.
- Never force push, never use `reset --hard`, never rebase shared branches.
- Ask before any command that deletes or rewrites history.

### Secrets

- Never write API keys in code. Read them on the server from environment variables.
- `.env.local` is never committed.

### UI

- The whole interface is right-to-left.
- All user-facing text comes from `src/i18n/fa.json`.
- Colors and fonts come only from `src/styles/tokens.css`.
- Brand colors: deep navy `#041E42`, signal red `#CD001A`, live red `#FF2D46` (only on navy), denim blue `#2B4C7E`, bone cream `#F5F1EA`, concrete gray `#8A8D91`.
- Fonts: Vazirmatn (body), Estedad (headings), Lalezar (display).
- Only one red primary button per page, with a 33-degree cut edge.

### Demo mode

- Everything must work without any API key, using the sample files in `fixtures`.

### Architecture

- Video work runs in the browser with ffmpeg.wasm. Only compressed audio, in chunks under 4 MB, goes to the server.
- Projects are stored in the browser with IndexedDB. There is no database and no login.

### Cost

- Prefer inexpensive or free models, and cache results.
