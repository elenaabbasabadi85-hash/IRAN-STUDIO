// Which words normalize() changed in one text, so the editor page can list each fix as «before ← after».
// No imports, so plain node can run its test.

export interface WordFix {
  before: string;
  after: string;
}

const ZWNJ = /\u200C/g;

// چرا diff کلمه‌به‌کلمه؟ کاربر باید هر اصلاح کد را ببیند، نه کل متن را دوباره بخواند. «بلندترین زیردنباله‌ی
// مشترک» (LCS) کلمه‌هایی را پیدا می‌کند که دست نخورده‌اند؛ بقیه‌ی کلمه‌ها اصلاح‌اند و همسایه‌ها یک اصلاح می‌شوند.
// متن با فاصله‌ها تکه می‌شود، پس تغییری که فقط در فاصله‌هاست (دو فاصله به یکی) اعمال می‌شود ولی در فهرست نمی‌آید.
/** The groups of neighbouring words that differ between `before` and `after`, in order. */
export function wordFixes(before: string, after: string): WordFix[] {
  const a = before.split(/\s+/u).filter(Boolean);
  const b = after.split(/\s+/u).filter(Boolean);

  // lcs[i * width + j]: how many words a[i..] and b[j..] share in order. A section is at most a few
  // hundred words, so the table stays small; a word never reaches Uint16's 65535.
  const width = b.length + 1;
  const lcs = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j] ? lcs[(i + 1) * width + j + 1] + 1 : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const fixes: WordFix[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const close = () => {
    const fix = { before: removed.join(" "), after: added.join(" ") };
    // A half-space alone is invisible («کتاب‌» ← «کتاب»): applied, but listing it would only confuse.
    if (fix.before.replace(ZWNJ, "") !== fix.after.replace(ZWNJ, "")) fixes.push(fix);
    removed = [];
    added = [];
  };

  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      close();
      i++;
      j++;
    } else if (j < b.length && (i === a.length || lcs[i * width + j + 1] > lcs[(i + 1) * width + j])) {
      added.push(b[j++]);
    } else {
      // On a tie the old word goes first, so «خانه ی» and «خانه‌ی» land in one fix.
      removed.push(a[i++]);
    }
  }
  close();
  return fixes;
}
