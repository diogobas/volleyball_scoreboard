import { mapTeams } from '../game/teamMap';
import type { RankedPlayer, TeamId, TeamMap } from '../game/types';
import type { PublicMatch, PublicMatchPlayer, PublicSet } from '../remote/models';
export type StatisticsMatch = Pick<PublicMatch, 'team_a_name' | 'team_b_name'> &
  Partial<Omit<PublicMatch, 'team_a_name' | 'team_b_name' | 'sets' | 'errors_a' | 'errors_b'>> & {
    sets: (Omit<PublicSet, 'errors_a' | 'errors_b'> & { errors_a?: number; errors_b?: number })[];
    errors_a?: number | null;
    errors_b?: number | null;
  };
const teamIds: TeamId[] = ['A', 'B'];

const playerTotals = (
  rows: PublicMatchPlayer[],
  teamNames: TeamMap<string>,
): (RankedPlayer & { teamIds: TeamId[]; isError?: boolean })[] => {
  const people = new Map<string, { id: string; name: string; points: number; teamIds: TeamId[] }>();
  for (const row of rows) {
    const previous = people.get(row.id) ?? { id: row.id, name: row.name, points: 0, teamIds: [] };
    previous.points += row.points;
    previous.name = row.name;
    if (!previous.teamIds.includes(row.team)) previous.teamIds.push(row.team);
    people.set(row.id, previous);
  }
  return [...people.values()].map((person) => ({
    ...person,
    teamId: person.teamIds[0],
    teamName: person.teamIds.map((team) => teamNames[team]).join(' / '),
  }));
};

// Build the same display model as the app without reconstructing a playable match.
export const publicMatchStatistics = (match: StatisticsMatch) => {
  const names = { A: match.team_a_name, B: match.team_b_name };
  const showPlayerTotals = match.player_totals_recorded !== false;
  const rows =
    match.entry_mode === 'summary' ? match.players! : match.sets.flatMap((set) => set.players);
  const topPlayers = playerTotals(rows, names)
    .filter((player) => player.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
  const teams = teamIds.map((team) => {
    const people = playerTotals(
      rows.filter((row) => row.team === team),
      names,
    );
    const errors =
      match.entry_mode === 'summary'
        ? team === 'A'
          ? match.errors_a!
          : match.errors_b!
        : match.sets.reduce((sum, set) => sum + (team === 'A' ? set.errors_a! : set.errors_b!), 0);
    return {
      id: team,
      name: names[team],
      players: [...people, { id: 'err', name: 'Opponent’s error', points: errors, isError: true }],
    };
  });
  const sets = match.sets.map((set) => {
    const teamNames = { A: set.team_a_name, B: set.team_b_name };
    return {
      statisticsAvailable: set.statistics_available,
      training: set.training ?? (match.decided_at != null && set.number > match.decided_at),
      early_finish: set.early_finish,
      setNumber: set.number,
      teamAName: teamNames.A,
      teamBName: teamNames.B,
      scoreA: set.score_a,
      scoreB: set.score_b,
      rosters: mapTeams((team) => set.players.filter((player) => player.team === team)),
      ranking: playerTotals(set.players, teamNames)
        .filter((player) => player.points > 0)
        .sort((a, b) => b.points - a.points),
    };
  });
  return {
    topPlayers: showPlayerTotals ? topPlayers : [],
    teams: showPlayerTotals ? teams : [],
    sets,
    showPlayerTotals,
  };
};
