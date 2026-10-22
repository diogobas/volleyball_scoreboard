export const STORAGE_KEY = 'volleyball-scoreboard:v1';
export const TEAM_IDS = ['A', 'B'];
const rosters = {
  A: ['Anderson', 'Carlos', 'Diego', 'Jota', 'Kaue', 'KJ'],
  B: ['Chicó', 'Denilson', 'Diogo', 'Dimitri', 'Gaëtan', 'Omer'],
};

export function createMatch() {
  return {
    currentSet: 1,
    sidesSwapped: false,
    teams: Object.fromEntries(TEAM_IDS.map((id, index) => [id, {
      name: `Team ${index + 1}`,
      setsWon: 0,
      players: [...rosters[id].map((name, i) => ({ id: `p${i + 1}`, name, isError: false })),
        { id: 'err', name: 'Unfforced error', isError: true }]
        .map(player => ({ ...player, setPoints: 0, matchPoints: 0 })),
    }])),
    log: [],
  };
}

export function teamScore(team) {
  return team.players.reduce((sum, player) => sum + player.setPoints, 0);
}

export function matchReducer(state, action) {
  switch (action.type) {
    case 'switchSides':
      return { ...state, sidesSwapped: !state.sidesSwapped };
    case 'point': {
      const team = state.teams[action.team];
      const player = team?.players.find(p => p.id === action.playerId);
      if (!player) return state;
      return {
        ...state,
        teams: { ...state.teams, [action.team]: { ...team,
          players: team.players.map(p => p.id === player.id
            ? { ...p, setPoints: p.setPoints + 1, matchPoints: p.matchPoints + 1 } : p),
        } },
        log: [...state.log, { type: 'point', team: action.team, playerId: player.id,
          playerName: player.name, teamName: team.name }],
      };
    }
    case 'closeSet': {
      const scoreA = teamScore(state.teams.A);
      const scoreB = teamScore(state.teams.B);
      // Preserve manual set closing, including ties, from the original HTML.
      if (scoreA + scoreB === 0) return state;
      const entry = { type: 'set', setNumber: state.currentSet, scoreA, scoreB,
        teamAName: state.teams.A.name, teamBName: state.teams.B.name,
        snapshots: Object.fromEntries(TEAM_IDS.map(id => [id, {
          setsWon: state.teams[id].setsWon,
          points: state.teams[id].players.map(p => p.setPoints),
        }])),
      };
      return { ...state, currentSet: state.currentSet + 1, log: [...state.log, entry],
        teams: Object.fromEntries(TEAM_IDS.map(id => [id, {
          ...state.teams[id],
          setsWon: state.teams[id].setsWon + Number(id === 'A' ? scoreA > scoreB : scoreB > scoreA),
          players: state.teams[id].players.map(p => ({ ...p, setPoints: 0 })),
        }])),
      };
    }
    case 'undo': {
      const last = state.log.at(-1);
      if (!last) return state;
      if (last.type === 'set') {
        return { ...state, currentSet: last.setNumber, log: state.log.slice(0, -1),
          teams: Object.fromEntries(TEAM_IDS.map(id => [id, { ...state.teams[id],
            setsWon: last.snapshots[id].setsWon,
            players: state.teams[id].players.map((p, i) => ({ ...p, setPoints: last.snapshots[id].points[i] })),
          }])),
        };
      }
      const team = state.teams[last.team];
      return { ...state, log: state.log.slice(0, -1), teams: { ...state.teams,
        [last.team]: { ...team, players: team.players.map(p => p.id === last.playerId
          ? { ...p, setPoints: p.setPoints - 1, matchPoints: p.matchPoints - 1 } : p) },
      } };
    }
    case 'edit':
      return { ...state, teams: Object.fromEntries(TEAM_IDS.map(id => [id, {
        ...state.teams[id], name: action.teams[id].name.trim().slice(0, 16) || state.teams[id].name,
        players: state.teams[id].players.map((p, i) => p.isError ? p : { ...p,
          name: action.teams[id].players[i].name.trim().slice(0, 20) || p.name }),
      }])) };
    case 'reset':
      return { ...createMatch(), sidesSwapped: state.sidesSwapped, teams: Object.fromEntries(TEAM_IDS.map(id => [id, {
        ...state.teams[id], setsWon: 0,
        players: state.teams[id].players.map(p => ({ ...p, setPoints: 0, matchPoints: 0 })),
      }])) };
    default:
      return state;
  }
}

// Replaying the log validates saved counters and set snapshots instead of trusting them.
export function restoreMatch(raw) {
  if (!raw) return createMatch();
  const saved = JSON.parse(raw);
  const initial = createMatch();
  initial.sidesSwapped = saved.sidesSwapped === true;
  for (const id of TEAM_IDS) {
    const team = saved.teams[id];
    if (typeof team.name !== 'string' || !team.name.trim() || team.name.length > 16 ||
        team.players.length !== 7) throw new Error('Invalid team');
    initial.teams[id].name = team.name;
    team.players.forEach((p, i) => {
      if (p.id !== initial.teams[id].players[i].id || typeof p.name !== 'string' ||
          !p.name.trim() || p.name.length > 20) throw new Error('Invalid player');
      if (!initial.teams[id].players[i].isError) initial.teams[id].players[i].name = p.name;
    });
  }
  if (!Array.isArray(saved.log)) throw new Error('Invalid history');
  let restored = initial;
  for (const entry of saved.log) {
    if (entry.type === 'point') {
      if (!TEAM_IDS.includes(entry.team) || !initial.teams[entry.team].players.some(p => p.id === entry.playerId) ||
          typeof entry.playerName !== 'string' || typeof entry.teamName !== 'string') throw new Error('Invalid point');
      restored = matchReducer(restored, { type: 'point', team: entry.team, playerId: entry.playerId });
      restored.log[restored.log.length - 1] = { ...restored.log.at(-1), playerName: entry.playerName, teamName: entry.teamName };
    } else if (entry.type === 'set') {
      if (!teamScore(restored.teams.A) && !teamScore(restored.teams.B)) throw new Error('Empty set');
      if (typeof entry.teamAName !== 'string' || typeof entry.teamBName !== 'string') throw new Error('Invalid set');
      restored = matchReducer(restored, { type: 'closeSet' });
      restored.log[restored.log.length - 1] = { ...restored.log.at(-1), teamAName: entry.teamAName, teamBName: entry.teamBName };
    } else throw new Error('Invalid event');
  }
  return restored;
}
