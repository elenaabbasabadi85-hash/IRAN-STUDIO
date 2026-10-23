// Persian number and time formatting shared by the video pages.

export const MB = 1024 * 1024;
export const num1 = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 1 });
export const int = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const pad2 = new Intl.NumberFormat("fa-IR", { minimumIntegerDigits: 2, maximumFractionDigits: 0 });
const tenths = new Intl.NumberFormat("fa-IR", {
  minimumIntegerDigits: 2,
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** m:ss.s in Persian digits, e.g. ۱:۰۵٫۳ */
export function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${int.format(minutes)}:${tenths.format(Math.floor((seconds - minutes * 60) * 10) / 10)}`;
}

/** m:ss in Persian digits, for the total length. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  return `${int.format(Math.floor(total / 60))}:${pad2.format(total % 60)}`;
}
