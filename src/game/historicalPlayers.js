import { normalizeName } from './playerNames.js';

export const historicalPlayerKey = (player) => player.player_id || normalizeName(player.name);
export const competitiveTeam = (player) =>
  Object.hasOwn(player, 'result_team') ? player.result_team : player.team;

// One identity can have separate point totals for each team, but one competitive result.
export function updateHistoricalPlayer(players, index, patch) {
  const previous = players[index];
  const changed = { ...previous, ...patch };
  const key = historicalPlayerKey(changed);
  const samePlayer = players.find((p, i) => i !== index && historicalPlayerKey(p) === key);
  changed.result_team = Object.hasOwn(patch, 'result_team')
    ? patch.result_team
    : samePlayer
      ? competitiveTeam(samePlayer)
      : historicalPlayerKey(previous) === key
        ? competitiveTeam(previous)
        : changed.team;
  return players.map((p, i) =>
    i === index
      ? changed
      : key && historicalPlayerKey(p) === key
        ? { ...p, result_team: changed.result_team }
        : p,
  );
}
