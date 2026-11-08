const teamIds = ['A', 'B'];

function playerTotals(rows, teamNames) {
  const people = new Map();
  for (const row of rows) {
    const previous = people.get(row.id) ?? { id: row.id, name: row.name, points: 0, teamIds: [] };
    previous.points += row.points;
    previous.name = row.name;
    if (!previous.teamIds.includes(row.team)) previous.teamIds.push(row.team);
    people.set(row.id, previous);
  }
  return [...people.values()].map(person => ({ ...person, teamId: person.teamIds[0],
    teamName: person.teamIds.map(team => teamNames[team]).join(' / '),
  }));
}

// Build the same display model as the app without reconstructing a playable match.
export function publicMatchStatistics(match) {
  const names = { A: match.team_a_name, B: match.team_b_name };
  const rows = match.sets.flatMap(set => set.players);
  const topPlayers = playerTotals(rows, names).filter(player => player.points > 0)
    .sort((a, b) => b.points - a.points).slice(0, 3);
  const teams = teamIds.map(team => {
    const people = playerTotals(rows.filter(row => row.team === team), names);
    const errors = match.sets.reduce((sum, set) => sum + (team === 'A' ? set.errors_a : set.errors_b), 0);
    return { id: team, name: names[team], players: [...people,
      { id: 'err', name: 'Opponent’s error', points: errors, isError: true },
    ] };
  });
  const sets = match.sets.map(set => {
    const teamNames = { A: set.team_a_name, B: set.team_b_name };
    return { setNumber: set.number, teamAName: teamNames.A, teamBName: teamNames.B, scoreA: set.score_a, scoreB: set.score_b,
      rosters: Object.fromEntries(teamIds.map(team => [team, set.players.filter(player => player.team === team)])),
      ranking: playerTotals(set.players, teamNames).filter(player => player.points > 0).sort((a, b) => b.points - a.points),
    };
  });
  return { topPlayers, teams, sets };
}
