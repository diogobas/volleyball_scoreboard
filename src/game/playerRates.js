const format = new Intl.NumberFormat('en', { style: 'percent', maximumFractionDigits: 1 });
export function percentage(part, total) {
  return Number.isInteger(part) && part >= 0 && Number.isInteger(total) && total > 0
    ? format.format(part / total)
    : '—';
}
