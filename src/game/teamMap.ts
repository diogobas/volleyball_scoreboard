import type { TeamId, TeamMap } from './types';

export const mapTeams = <T>(map: (id: TeamId, index: number) => T): TeamMap<T> => ({
  A: map('A', 0),
  B: map('B', 1),
});
