import { canCloseMatch, matchPlayerStats } from './match.js';

export function groupDate(timestamp, timeZone) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid match date');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date);
  const value = type => parts.find(part => part.type === type).value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}

export function availableSeasons(matches, group, now = new Date().toISOString()) {
  const years = new Set([groupDate(now, group.timeZone).slice(0, 4)]);
  for (const match of matches) {
    if (!match.unavailable && match.state.groupId === group.id) {
      years.add(groupDate(match.state.startedAt ?? match.closedAt, group.timeZone).slice(0, 4));
    }
  }
  return [...years].sort((a, b) => b.localeCompare(a));
}

export function seasonStatistics(matches, group, players, season) {
  const rows = new Map(players.filter(player => player.groupId === group.id).map(player => [player.id, {
    personId: player.id, name: player.name, points: 0, matches: 0, wins: 0, dates: new Set(),
  }]));
  let includedMatches = 0;
  let fallbackDates = 0;
  let unassociatedMatches = 0;
  let unavailableMatches = 0;
  for (const match of matches) {
    if (match.unavailable) { unavailableMatches++; continue; }
    const state = match.state;
    if (!state.groupId) { unassociatedMatches++; continue; }
    if (state.groupId !== group.id || !canCloseMatch(state)) continue;
    const date = groupDate(state.startedAt ?? match.closedAt, group.timeZone);
    if (date.slice(0, 4) !== String(season)) continue;
    includedMatches++;
    if (!state.startedAt) fallbackDates++;
    const { A, B } = state.teams;
    const winner = A.setsWon === B.setsWon ? null : A.setsWon > B.setsWon ? 'A' : 'B';
    for (const player of matchPlayerStats(state)) {
      const row = rows.get(player.personId) ?? {
        personId: player.personId, name: player.name, points: 0, matches: 0, wins: 0, dates: new Set(),
      };
      row.points += player.matchPoints;
      row.matches++;
      row.dates.add(date);
      if (winner && player.teamIds.length === 1 && player.teamIds[0] === winner) row.wins++;
      rows.set(player.personId, row);
    }
  }
  return {
    includedMatches, fallbackDates, unassociatedMatches, unavailableMatches,
    rows: [...rows.values()].map(({ dates, ...row }) => ({ ...row, days: dates.size }))
      .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }) || a.personId.localeCompare(b.personId)),
  };
}
