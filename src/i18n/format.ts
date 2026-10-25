// Fills {name} placeholders in a fa.json string. Numbers are written with Persian digits.

const digits = new Intl.NumberFormat('fa-IR', { useGrouping: false });

export function formatNumber(value: number): string {
  return digits.format(value);
}

export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (placeholder, key: string) => {
    const value = values[key];
    if (value === undefined) return placeholder;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}
