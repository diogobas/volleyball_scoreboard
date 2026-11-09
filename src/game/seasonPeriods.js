export const seasonPeriods = [
  { id: 'winter', label: 'Winter (Dec–Feb)' },
  { id: 'spring', label: 'Spring (Mar–May)' },
  { id: 'summer', label: 'Summer (Jun–Aug)' },
  { id: 'fall', label: 'Fall (Sep–Nov)' },
];

export function currentPeriod(date = new Date()) {
  return ['winter', 'spring', 'summer', 'fall'][Math.floor((date.getMonth() + 1) % 12 / 3)];
}

export function periodTitle(year, period) {
  const label = seasonPeriods.find(item => item.id === period)?.label.split(' (')[0];
  return label ? `${label} ${year}` : String(year);
}
