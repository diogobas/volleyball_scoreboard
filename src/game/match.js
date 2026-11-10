import { matchResult } from './matchResult.js';
export const STORAGE_KEY = 'volleyball-scoreboard:v1';
export const TEAM_IDS = ['A', 'B'];
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rosters = {
  A: ['Anderson', 'Carlos', 'Diego', 'Jota', 'Kaue', 'KJ'],
  B: ['Chicó', 'Denilson', 'Diogo', 'Dimitri', 'Gaëtan', 'Omer'],
};

export function createMatch() {
  return {
    currentSet: 1,
    sidesSwapped: false,
    teams: Object.fromEntries(
      TEAM_IDS.map((id, index) => [
        id,
        {
          name: `Team ${index + 1}`,
          setsWon: 0,
          players: [
            ...rosters[id].map((name, i) => ({ id: `p${i + 1}`, name, isError: false })),
            { id: 'err', name: 'Opponent’s error', isError: true },
          ].map((player) => ({ ...player, setPoints: 0, matchPoints: 0 })),
        },
      ]),
    ),
    log: [],
  };
}

export function teamScore(team) {
  return team.players.reduce((sum, player) => sum + player.setPoints, 0);
}

export function canCloseMatch(state) {
  return (
    state.log.some((entry) => entry.type === 'set') &&
    TEAM_IDS.every((id) => teamScore(state.teams[id]) === 0)
  );
}

export const canChangeRoster = (state) => TEAM_IDS.every((id) => teamScore(state.teams[id]) === 0);
export const matchRoster = (state) =>
  Object.fromEntries(
    TEAM_IDS.map((id) => [
      id,
      state.teams[id].players
        .filter((player) => !player.isError)
        .map(({ id, personId, name }) => ({ id, personId, name })),
    ]),
  );

function validateRoster(rosters) {
  const people = new Set();
  for (const team of TEAM_IDS) {
    if (!Array.isArray(rosters?.[team]) || rosters[team].length !== 6)
      throw new Error('Invalid roster');
    rosters[team].forEach((player, i) => {
      if (
        player.id !== `p${i + 1}` ||
        !uuidPattern.test(player.personId) ||
        people.has(player.personId) ||
        typeof player.name !== 'string' ||
        !player.name.trim() ||
        player.name.length > 60
      )
        throw new Error('Invalid roster player');
      people.add(player.personId);
    });
  }
}

function applyRoster(state, rosters) {
  validateRoster(rosters);
  return {
    ...state,
    teams: Object.fromEntries(
      TEAM_IDS.map((id) => [
        id,
        {
          ...state.teams[id],
          players: state.teams[id].players.map((player, index) =>
            player.isError
              ? player
              : {
                  ...player,
                  ...rosters[id][index],
                  setPoints: 0,
                  matchPoints: state.log.filter(
                    (entry) =>
                      entry.type === 'point' && entry.personId === rosters[id][index].personId,
                  ).length,
                },
          ),
        },
      ]),
    ),
  };
}

// Include everyone who played a set with points, even if they later left the court.
export function matchPlayerStats(state) {
  if (!state.groupId)
    return TEAM_IDS.flatMap((id) =>
      state.teams[id].players
        .filter((p) => !p.isError)
        .map((player) => ({
          ...player,
          teamId: id,
          teamIds: [id],
          teamPoints: { [id]: player.matchPoints },
          teamName: state.teams[id].name,
        })),
    );
  let roster = state.initialRoster ?? matchRoster(state);
  const people = new Map();
  const include = () => {
    for (const id of TEAM_IDS)
      for (const player of roster[id]) {
        const previous = people.get(player.personId) ?? {
          ...player,
          matchPoints: 0,
          teamIds: [],
          teamPoints: {},
        };
        if (!previous.teamIds.includes(id)) previous.teamIds.push(id);
        previous.teamPoints[id] ??= 0;
        people.set(player.personId, previous);
      }
  };
  for (const entry of state.log) {
    if (entry.type === 'roster') roster = entry.rosters;
    if (entry.type !== 'point') continue;
    include();
    if (entry.playerId !== 'err') {
      const player = people.get(entry.personId);
      player.matchPoints++;
      player.teamPoints[entry.team]++;
    }
  }
  if (!people.size) include();
  return [...people.values()].map((player) => ({
    ...player,
    teamId: player.teamIds[0],
    teamName: player.teamIds.map((id) => state.teams[id].name).join(' / '),
  }));
}

export function teamMatchPlayers(state, teamId) {
  if (!state.groupId) return state.teams[teamId].players;
  return [
    ...matchPlayerStats(state)
      .filter((player) => player.teamIds.includes(teamId))
      .map((player) => ({
        ...player,
        id: player.personId,
        matchPoints: player.teamPoints[teamId],
      })),
    state.teams[teamId].players.find((player) => player.isError),
  ];
}

// Replay stored points without applying new rules to historical sets.
function addPoint(state, action) {
  const team = state.teams[action.team];
  const player = team?.players.find((p) => p.id === action.playerId);
  if (!player) return state;
  return {
    ...state,
    ...(!state.startedAt && action.startedAt && !state.log.some((entry) => entry.type === 'point')
      ? { startedAt: action.startedAt }
      : {}),
    teams: {
      ...state.teams,
      [action.team]: {
        ...team,
        players: team.players.map((p) =>
          p.id === player.id
            ? { ...p, setPoints: p.setPoints + 1, matchPoints: p.matchPoints + 1 }
            : p,
        ),
      },
    },
    log: [
      ...state.log,
      {
        type: 'point',
        team: action.team,
        playerId: player.id,
        ...(player.personId ? { personId: player.personId } : {}),
        playerName: player.name,
        teamName: team.name,
      },
    ],
  };
}

export function setRanking(state, setNumber) {
  let currentSet = 1;
  const players = new Map();
  for (const entry of state.log) {
    if (entry.type === 'set') {
      if (entry.setNumber === setNumber) break;
      currentSet = entry.setNumber + 1;
    } else if (entry.type === 'point' && currentSet === setNumber && entry.playerId !== 'err') {
      const key = entry.personId ?? `${entry.team}-${entry.playerId}`;
      const previous = players.get(key);
      players.set(key, {
        teamId: entry.team,
        id: entry.playerId,
        name: entry.playerName,
        teamName: entry.teamName,
        points: (previous?.points ?? 0) + 1,
      });
    }
  }
  return [...players.values()].sort(
    (a, b) =>
      b.points - a.points ||
      TEAM_IDS.indexOf(a.teamId) - TEAM_IDS.indexOf(b.teamId) ||
      a.id.localeCompare(b.id),
  );
}

function reduceMatch(state, action) {
  switch (action.type) {
    case 'roster': {
      if (!state.groupId || !canChangeRoster(state))
        throw new Error('Players can only change between sets, before the next point.');
      const previousRosters = matchRoster(state);
      const rosters = structuredClone(action.rosters);
      const changed = applyRoster(state, rosters);
      return {
        ...changed,
        initialRoster: state.initialRoster ?? previousRosters,
        log: [
          ...state.log,
          { type: 'roster', setNumber: state.currentSet, previousRosters, rosters },
        ],
      };
    }
    case 'switchSides':
      return { ...state, sidesSwapped: !state.sidesSwapped };
    case 'point': {
      const scored = addPoint(state, action);
      if (scored === state) return state;
      const scoreA = teamScore(scored.teams.A);
      const scoreB = teamScore(scored.teams.B);
      return Math.max(scoreA, scoreB) >= 25 && Math.abs(scoreA - scoreB) >= 2
        ? matchReducer(scored, { type: 'closeSet' })
        : scored;
    }
    case 'closeSet': {
      const scoreA = teamScore(state.teams.A);
      const scoreB = teamScore(state.teams.B);
      // Preserve manual set closing, including ties, from the original HTML.
      if (scoreA + scoreB === 0) return state;
      const entry = {
        type: 'set',
        setNumber: state.currentSet,
        scoreA,
        scoreB,
        ...(state.groupId ? { rosters: matchRoster(state) } : {}),
        sidesSwappedBefore: state.sidesSwapped,
        teamAName: state.teams.A.name,
        teamBName: state.teams.B.name,
        snapshots: Object.fromEntries(
          TEAM_IDS.map((id) => [
            id,
            {
              setsWon: state.teams[id].setsWon,
              points: state.teams[id].players.map((p) => p.setPoints),
            },
          ]),
        ),
      };
      return {
        ...state,
        currentSet: state.currentSet + 1,
        sidesSwapped: !state.sidesSwapped,
        log: [...state.log, entry],
        teams: Object.fromEntries(
          TEAM_IDS.map((id) => [
            id,
            {
              ...state.teams[id],
              setsWon: matchResult([...state.log.filter((entry) => entry.type === 'set'), entry])[
                id === 'A' ? 'setsA' : 'setsB'
              ],
              players: state.teams[id].players.map((p) => ({ ...p, setPoints: 0 })),
            },
          ]),
        ),
      };
    }
    case 'undo': {
      const last = state.log.at(-1);
      if (!last) return state;
      if (last.type === 'roster') {
        const previous = applyRoster(
          { ...state, log: state.log.slice(0, -1) },
          last.previousRosters,
        );
        if (!previous.log.some((entry) => entry.type === 'roster')) delete previous.initialRoster;
        return previous;
      }
      if (last.type === 'set') {
        return {
          ...state,
          currentSet: last.setNumber,
          log: state.log.slice(0, -1),
          sidesSwapped:
            typeof last.sidesSwappedBefore === 'boolean'
              ? last.sidesSwappedBefore
              : state.sidesSwapped,
          teams: Object.fromEntries(
            TEAM_IDS.map((id) => [
              id,
              {
                ...state.teams[id],
                setsWon: last.snapshots[id].setsWon,
                players: state.teams[id].players.map((p, i) => ({
                  ...p,
                  setPoints: last.snapshots[id].points[i],
                })),
              },
            ]),
          ),
        };
      }
      const team = state.teams[last.team];
      const previous = {
        ...state,
        log: state.log.slice(0, -1),
        teams: {
          ...state.teams,
          [last.team]: {
            ...team,
            players: team.players.map((p) =>
              p.id === last.playerId
                ? { ...p, setPoints: p.setPoints - 1, matchPoints: p.matchPoints - 1 }
                : p,
            ),
          },
        },
      };
      if (!previous.log.some((entry) => entry.type === 'point')) delete previous.startedAt;
      return previous;
    }
    case 'edit': {
      const teams = Object.fromEntries(
        TEAM_IDS.map((id) => [
          id,
          {
            ...state.teams[id],
            name: action.teams[id].name.trim().slice(0, 16) || state.teams[id].name,
            players: state.teams[id].players.map((p, i) =>
              p.isError
                ? p
                : {
                    ...p,
                    name:
                      p.personId && !state.court
                        ? p.name
                        : action.teams[id].players[i].name.trim().slice(0, state.court ? 60 : 20) ||
                          p.name,
                  },
            ),
          },
        ]),
      );
      if (
        TEAM_IDS.every(
          (id) =>
            teams[id].name === state.teams[id].name &&
            teams[id].players.every((p, i) => p.name === state.teams[id].players[i].name),
        )
      )
        return state;
      return {
        ...state,
        teams,
        ...(state.court
          ? {
              court: {
                ...state.court,
                changes: [
                  ...state.court.changes,
                  { at: state.log.length, teams: structuredClone(teams) },
                ],
              },
            }
          : {}),
      };
    }
    case 'reset':
      return {
        ...createMatch(),
        ...(state.dayContext ? { dayContext: state.dayContext } : {}),
        ...(state.court ? { court: { initial: structuredClone(state.teams), changes: [] } } : {}),
        ...(state.groupId ? { groupId: state.groupId } : {}),
        sidesSwapped: state.sidesSwapped,
        teams: Object.fromEntries(
          TEAM_IDS.map((id) => [
            id,
            {
              ...state.teams[id],
              setsWon: 0,
              players: state.teams[id].players.map((p) => ({ ...p, setPoints: 0, matchPoints: 0 })),
            },
          ]),
        ),
      };
    default:
      return state;
  }
}

export function matchReducer(state, action) {
  const next = reduceMatch(state, action);
  // Name edits remain in effect after Undo, just as in the original app.
  // Move edits back with the removed event so subsequent points use the current lineup.
  if (action.type === 'undo' && next.court)
    return {
      ...next,
      court: {
        ...next.court,
        changes: next.court.changes.map((change) => ({
          ...change,
          at: Math.min(change.at, next.log.length),
        })),
      },
    };
  return next;
}

// Replaying the log validates saved counters and set snapshots instead of trusting them.
export function restoreMatch(raw) {
  if (!raw) return createMatch();
  const saved = JSON.parse(raw);
  const initial = createMatch();
  initial.sidesSwapped = saved.sidesSwapped === true;
  if (saved.startedAt !== undefined) {
    if (typeof saved.startedAt !== 'string' || !Number.isFinite(Date.parse(saved.startedAt)))
      throw new Error('Invalid start date');
    initial.startedAt = saved.startedAt;
  }
  if (saved.groupId !== undefined) {
    if (!uuidPattern.test(saved.groupId)) throw new Error('Invalid group');
    initial.groupId = saved.groupId;
  }
  const people = new Set();
  for (const id of TEAM_IDS) {
    const team = saved.teams[id];
    if (
      typeof team.name !== 'string' ||
      !team.name.trim() ||
      team.name.length > 16 ||
      team.players.length !== 7
    )
      throw new Error('Invalid team');
    initial.teams[id].name = team.name;
    team.players.forEach((p, i) => {
      if (
        p.id !== initial.teams[id].players[i].id ||
        typeof p.name !== 'string' ||
        !p.name.trim() ||
        p.name.length > 60
      )
        throw new Error('Invalid player');
      if (!initial.teams[id].players[i].isError) initial.teams[id].players[i].name = p.name;
      if (!initial.teams[id].players[i].isError && saved.groupId) {
        if (!uuidPattern.test(p.personId) || people.has(p.personId))
          throw new Error('Invalid player identity');
        people.add(p.personId);
        initial.teams[id].players[i].personId = p.personId;
      } else if (p.personId !== undefined) throw new Error('Unexpected player identity');
    });
  }
  if (!Array.isArray(saved.log)) throw new Error('Invalid history');
  if (saved.initialRoster !== undefined) {
    if (!saved.groupId || !saved.log.some((entry) => entry.type === 'roster'))
      throw new Error('Invalid initial roster');
    Object.assign(initial, applyRoster(initial, saved.initialRoster));
    initial.initialRoster = structuredClone(saved.initialRoster);
  }
  let restored = initial;
  for (const entry of saved.log) {
    if (entry.type === 'point') {
      if (
        !TEAM_IDS.includes(entry.team) ||
        !initial.teams[entry.team].players.some((p) => p.id === entry.playerId) ||
        typeof entry.playerName !== 'string' ||
        typeof entry.teamName !== 'string'
      )
        throw new Error('Invalid point');
      const personId = restored.teams[entry.team].players.find(
        (p) => p.id === entry.playerId,
      ).personId;
      if (entry.personId !== personId) throw new Error('Invalid point identity');
      restored = addPoint(restored, { team: entry.team, playerId: entry.playerId });
      restored.log[restored.log.length - 1] = {
        ...restored.log.at(-1),
        playerName: entry.playerName,
        teamName: entry.teamName,
      };
    } else if (entry.type === 'roster') {
      if (
        !saved.initialRoster ||
        entry.setNumber !== restored.currentSet ||
        JSON.stringify(entry.previousRosters) !== JSON.stringify(matchRoster(restored))
      )
        throw new Error('Invalid roster history');
      restored = matchReducer(restored, { type: 'roster', rosters: entry.rosters });
    } else if (entry.type === 'set') {
      if (!teamScore(restored.teams.A) && !teamScore(restored.teams.B))
        throw new Error('Empty set');
      if (typeof entry.teamAName !== 'string' || typeof entry.teamBName !== 'string')
        throw new Error('Invalid set');
      restored = matchReducer(restored, { type: 'closeSet' });
      restored.log[restored.log.length - 1] = {
        ...restored.log.at(-1),
        teamAName: entry.teamAName,
        teamBName: entry.teamBName,
      };
      // The saved side is already the current layout; replay must not swap it again.
      restored.sidesSwapped = initial.sidesSwapped;
      if (typeof entry.sidesSwappedBefore === 'boolean') {
        restored.log.at(-1).sidesSwappedBefore = entry.sidesSwappedBefore;
      } else {
        // Older set closures did not swap sides, including when undone.
        delete restored.log.at(-1).sidesSwappedBefore;
      }
    } else throw new Error('Invalid event');
  }
  if (
    !saved.court &&
    saved.initialRoster &&
    JSON.stringify(matchRoster(restored)) !== JSON.stringify(matchRoster({ teams: saved.teams }))
  ) {
    throw new Error('Roster does not match its history');
  }
  if (saved.court) {
    const checkTeams = (teams) => {
      for (const id of TEAM_IDS) {
        if (
          typeof teams?.[id]?.name !== 'string' ||
          !teams[id].name.trim() ||
          teams[id].name.length > 16 ||
          teams[id].players?.length !== 7
        )
          throw new Error('Invalid saved names');
        teams[id].players.forEach((p, i) => {
          if (
            p.id !== (i === 6 ? 'err' : `p${i + 1}`) ||
            typeof p.name !== 'string' ||
            !p.name.trim() ||
            p.name.length > 60
          )
            throw new Error('Invalid saved player name');
        });
      }
    };
    checkTeams(saved.court.initial);
    if (!Array.isArray(saved.court.changes)) throw new Error('Invalid name history');
    for (const change of saved.court.changes) {
      if (!Number.isInteger(change.at) || change.at < 0) throw new Error('Invalid name change');
      checkTeams(change.teams);
    }
    restored.court = structuredClone(saved.court);
    for (const id of TEAM_IDS) {
      restored.teams[id].name = saved.teams[id].name;
      restored.teams[id].players.forEach((p, i) => {
        if (!p.isError) p.name = saved.teams[id].players[i].name;
      });
    }
  }
  if (saved.dayContext) {
    const day = saved.dayContext;
    if (
      !uuidPattern.test(day.day_id) ||
      !uuidPattern.test(day.group_id) ||
      typeof day.code !== 'string' ||
      !Number.isInteger(day.lineup_version)
    )
      throw new Error('Invalid saved game day');
    restored.dayContext = structuredClone(day);
  }
  return restored;
}

export function enableCourtMode(state) {
  return state.court
    ? state
    : { ...state, court: { initial: structuredClone(state.teams), changes: [] } };
}
