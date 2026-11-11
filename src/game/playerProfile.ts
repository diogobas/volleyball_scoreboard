export const playerSexes = [
  { id: 'female', label: 'Female' },
  { id: 'male', label: 'Male' },
  { id: 'other', label: 'Other' },
];

export const playerPositions = [
  { id: 'S', label: 'Setter' },
  { id: 'MB', label: 'Middle Blocker' },
  { id: 'O', label: 'Outside Hitter' },
  { id: 'OH', label: 'Opposite Hitter' },
  { id: 'LB', label: 'Libero' },
];

export const sexLabel = (sex: string | null | undefined) => {
  return playerSexes.find((item) => item.id === sex)?.label ?? 'Not specified';
};
export const positionLabel = (code: string) => {
  const position = playerPositions.find((item) => item.id === code);
  return position ? `${position.label} (${position.id})` : code;
};
