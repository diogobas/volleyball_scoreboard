export const lineupRoles = [
  { id: 'S', label: 'Setter', target: 1 },
  { id: 'MB', label: 'Middle Blocker', target: 2 },
  { id: 'OH', label: 'Outside Hitter', target: 2 },
  { id: 'O', label: 'Opposite Hitter', target: 1 },
] as const;

export type LineupRole = (typeof lineupRoles)[number]['id'];

type RoleCandidate = { role?: LineupRole; preferences: readonly LineupRole[] };

export const lineupCoverage = (players: readonly (RoleCandidate | null)[]) => {
  const roles = players.map((player) => player?.role);
  const counts: Record<LineupRole, number> = { S: 0, MB: 0, OH: 0, O: 0 };
  for (const role of roles) if (role) counts[role]++;

  const vacancies = lineupRoles.flatMap(({ id, target }) =>
    Array<LineupRole>(Math.max(0, target - counts[id])).fill(id),
  );
  const assignments = Array<number | undefined>(vacancies.length).fill(undefined);

  // Move flexible players between vacancies when that lets another player cover a role.
  const place = (playerIndex: number, visited: Set<number>): boolean => {
    return vacancies.some((role, vacancy) => {
      if (visited.has(vacancy) || !players[playerIndex]?.preferences.includes(role)) return false;
      visited.add(vacancy);
      const previous = assignments[vacancy];
      if (previous !== undefined && !place(previous, visited)) return false;
      assignments[vacancy] = playerIndex;
      return true;
    });
  };

  players.forEach((player, index) => {
    if (player && !player.role) place(index, new Set());
  });
  assignments.forEach((index, vacancy) => {
    if (index === undefined) return;
    const role = vacancies[vacancy];
    roles[index] = role;
    counts[role]++;
  });

  const filled = lineupRoles.reduce(
    (total, { id, target }) => total + Math.min(counts[id], target),
    0,
  );
  return { roles, counts, filled };
};
