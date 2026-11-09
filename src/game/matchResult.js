import { competitiveTeam, historicalPlayerKey } from './historicalPlayers.js';

// A match is decided once: later sets remain useful as training statistics.
export function matchResult(sets) {
  let setsA = 0; let setsB = 0; let winner = null; let decidedAt = null;
  const classified = sets.map((set, index) => {
    const training = winner !== null;
    const a = set.score_a ?? set.scoreA; const b = set.score_b ?? set.scoreB;
    if (!training) {
      if (a > b) setsA++; else if (b > a) setsB++;
      if (setsA === 3 || setsB === 3) { winner = setsA === 3 ? 'A' : 'B'; decidedAt = index + 1; }
    }
    return { ...set, training };
  });
  return { setsA, setsB, winner, decidedAt, trainingSets: classified.filter(set => set.training).length, sets: classified };
}

export function validSetScore(a, b, target) {
  const high = Math.max(a, b); const low = Math.min(a, b);
  return Number.isInteger(a) && Number.isInteger(b) && low >= 0 &&
    (high === target && low <= target - 2 || high > target && high === low + 2);
}

export function historicalErrors(payload) {
  const errors = [];
  if (!payload.played_on) errors.push('Choose the match date.');
  if (!['official', 'recreational'].includes(payload.rules)) errors.push('Choose the match format.');
  if (!payload.sets?.length) errors.push('Add at least one set.');
  const result = matchResult(payload.sets ?? []);
  result.sets.forEach((set, index) => {
    const a = Number(set.score_a); const b = Number(set.score_b);
    if (set.score_a === '' || set.score_b === '' || !Number.isInteger(a) || !Number.isInteger(b) || Math.min(a, b) < 0 || a === b) errors.push(`Set ${index + 1}: enter different nonnegative scores.`);
    else if (!set.training && !validSetScore(a, b, payload.rules === 'official' && index === 4 ? 15 : 25) &&
      (payload.rules === 'official' || !set.early_finish)) errors.push(`Set ${index + 1}: correct the score${payload.rules === 'recreational' ? ' or mark it as ended early' : ''}.`);
  });
  for (const team of ['A', 'B']) {
    if (!payload[team === 'A' ? 'team_a_name' : 'team_b_name']?.trim()) errors.push(`Team ${team}: enter a name.`);
  }
  if (payload.player_totals_recorded === false) return [...new Set(errors)];
  const seen = new Set();
  const resultTeams = new Map();
  for (const team of ['A', 'B']) {
    const people = payload.players.filter(player => player.team === team);
    if (people.length < 6) errors.push(`Team ${team}: include at least six players.`);
    if (!payload[team === 'A' ? 'team_a_name' : 'team_b_name']?.trim()) errors.push(`Team ${team}: enter a name.`);
    let total = Number(payload[team === 'A' ? 'errors_a' : 'errors_b']);
    if (!Number.isInteger(total) || total < 0) errors.push(`Team ${team}: enter nonnegative opponent errors.`);
    for (const p of people) {
      const key = historicalPlayerKey(p);
      const rowKey = `${team}:${key}`;
      const resultTeam = competitiveTeam(p);
      if (resultTeam !== null && !['A', 'B'].includes(resultTeam)) errors.push('Choose a valid competitive team.');
      if (resultTeams.has(key) && resultTeams.get(key) !== resultTeam) errors.push('Choose the same competitive team for both entries of a player who changed teams.');
      resultTeams.set(key, resultTeam);
      if (resultTeam !== null && !payload.players.some(other => historicalPlayerKey(other) === key && other.team === resultTeam)) errors.push('Competitive team must be one the player participated in.');
      if (!p.name.trim()) errors.push(`Team ${team}: enter every player name.`);
      if (seen.has(rowKey)) errors.push('Use a different player in each row of the same team.');
      seen.add(rowKey);
      if (!Number.isInteger(Number(p.points)) || Number(p.points) < 0 || p.points === '') errors.push(`Enter the points for ${p.name || 'each player'}.`);
      total += Number(p.points);
    }
    const score = payload.sets.reduce((sum, set) => sum + Number(set[team === 'A' ? 'score_a' : 'score_b']), 0);
    if (total !== score) errors.push(`Team ${team}: player points plus opponent errors must equal ${score}.`);
  }
  return [...new Set(errors)];
}
