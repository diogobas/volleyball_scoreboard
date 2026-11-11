import { canCloseMatch, matchRoster, restoreMatch } from '../game/match';
import { mapTeams } from '../game/teamMap';
import type { MatchSnapshot } from '../game/types';
import type { MatchSubmission, SubmittedPoint, SubmittedSet } from './models';

// Only public game data crosses the boundary. Undo metadata and account data stay local.
export const matchPayload = <T extends MatchSnapshot>(archive: T): MatchSubmission => {
  if (archive.formatVersion !== 1 || !archive.id || !Number.isFinite(Date.parse(archive.closedAt)))
    throw new Error('Invalid saved match.');
  const state = restoreMatch(JSON.stringify(archive.state));
  if (!state.groupId || !canCloseMatch(state))
    throw new Error('Associate players and close all scored sets before uploading.');
  let roster = state.initialRoster ?? matchRoster(state);
  let points: SubmittedPoint[] = [];
  const sets: SubmittedSet[] = [];
  for (const entry of state.log) {
    if (entry.type === 'roster') roster = entry.rosters;
    if (entry.type === 'point')
      points.push({
        team: entry.team,
        player_id: entry.playerId === 'err' ? null : entry.personId!,
        player_name: entry.playerId === 'err' ? null : entry.playerName,
        is_opponent_error: entry.playerId === 'err',
      });
    if (entry.type === 'set') {
      sets.push({
        team_a_name: entry.teamAName,
        team_b_name: entry.teamBName,
        score_a: entry.scoreA,
        score_b: entry.scoreB,
        rosters: mapTeams((team) =>
          (entry.rosters ?? roster)[team].map((player) => ({
            id: player.personId!,
            name: player.name,
          })),
        ),
        points,
      });
      points = [];
    }
  }
  return {
    format_version: 1,
    id: archive.id,
    group_id: state.groupId,
    started_at: state.startedAt ? new Date(state.startedAt).toISOString() : null,
    closed_at: new Date(archive.closedAt).toISOString(),
    team_a_name: state.teams.A.name,
    team_b_name: state.teams.B.name,
    sets,
  };
};

export const samePayload = (left: unknown, right: unknown) => {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, stable((value as Record<string, unknown>)[key])]),
      );
    return value;
  };
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
};
