// The countable text rules of the writer's publish kit. No server-only code and no Zod, so the
// write page can check an edited kit the same way, and plain node can run its test.

/** Trimmed, with every run of spaces or line breaks as one space, so «یه  ویدیو» and «یه ویدیو» are the same text. */
export function collapseSpaces(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

/** True when no two texts are the same after collapseSpaces. */
export function allDifferent(texts: string[]): boolean {
  return new Set(texts.map(collapseSpaces)).size === texts.length;
}

// Counted the way usesDisplayFont in src/video/cover/wrap.ts counts, so a cover text accepted here
// also gets the display font there. A local copy keeps this file independent of the Video lane's
// file; it must stay in step with that function.
/** A zero-width non-joiner is not a space, so «ایده‌ی روشن» is two words. */
export function coverWordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// The same steps as hashtagList in src/app/studio/[id]/publish/kit.ts, without adding the #: the kit
// keeps tags bare and the publish page adds it. A local copy keeps this file independent of the
// Platform lane's file; it must stay in step with that function.
/** «#تولید محتوا» becomes «تولید_محتوا»; a tag with nothing but # becomes "". */
export function normalizeHashtag(tag: string): string {
  return tag.trim().replace(/^#+/, "").trim().replace(/\s+/g, "_");
}
