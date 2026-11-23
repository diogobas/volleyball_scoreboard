export const playerSexes = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'other', label: 'Other' },
];

export const playerPositions = [
  { id: 'S', label: 'Setter (S)', abbreviation: 'S' },
  { id: 'MB', label: 'Middle Blocker (MB)', abbreviation: 'MB' },
  // Keep the stored hitter IDs so existing profiles retain their selected roles.
  { id: 'O', label: 'Outside Hitter (OH)', abbreviation: 'OH' },
  { id: 'OH', label: 'Opposite Hitter (O)', abbreviation: 'O' },
  { id: 'LB', label: 'Libero (LB)', abbreviation: 'LB' },
] as const;

export const sexLabel = (sex: string | null | undefined) => {
  return playerSexes.find((item) => item.id === sex)?.label ?? 'Not specified';
};
export const positionLabel = (code: string) => {
  return playerPositions.find((item) => item.id === code)?.label ?? code;
};
