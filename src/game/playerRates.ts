const format = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 });
export const percentage = (part: number | null | undefined, total: number | null | undefined) => {
  return typeof part === 'number' &&
    typeof total === 'number' &&
    Number.isInteger(part) &&
    part >= 0 &&
    Number.isInteger(total) &&
    total > 0
    ? format.format(part / total)
    : '—';
};
