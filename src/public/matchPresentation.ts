import { matchResult } from '../game/matchResult';
import type * as Models from '../remote/models';
import { teamColors } from '../theme';
export const matchTeamColors = { A: teamColors.B, B: teamColors.A };
export const playedTime = (match: Models.PublicMatch, timeZone: string) => {
  if (match.played_on)
    return new Intl.DateTimeFormat('en', { timeZone: 'UTC', dateStyle: 'medium' }).format(
      new Date(`${match.played_on}T12:00:00Z`),
    );
  return new Intl.DateTimeFormat('en', {
    timeZone,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(match.started_at ?? match.closed_at));
};
export const winnerFor = (match: Models.PublicMatch) =>
  Object.hasOwn(match, 'winner') ? match.winner : matchResult(match.sets).winner;
export const resultText = (match: Models.PublicMatch) =>
  match.ended_as_draw
    ? 'Draw · match ended early'
    : winnerFor(match)
      ? `Winner: ${winnerFor(match) === 'A' ? match.team_a_name : match.team_b_name}`
      : 'Match unfinished · no team has won three sets';
