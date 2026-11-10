const teams = ['A', 'B'];

export function recount(payload) {
  const next = structuredClone(payload);
  for (const set of next.sets) {
    set.score_a = set.points.filter((point) => point.team === 'A').length;
    set.score_b = set.points.filter((point) => point.team === 'B').length;
  }
  return next;
}

export function correctionErrors(payload, players) {
  const errors = [];
  const known = new Set(players.map((person) => person.id));
  if (!payload.sets.length) errors.push('Keep at least one completed set.');
  payload.sets.forEach((set, index) => {
    const label = `Set ${index + 1}`;
    if (!set.points.length) errors.push(`${label}: add points or remove the empty set.`);
    const people = teams.flatMap((team) => set.rosters[team]);
    if (
      teams.some(
        (team) =>
          set.rosters[team].length < 6 ||
          set.rosters[team].length > 100 ||
          new Set(set.rosters[team].map((p) => p.id)).size !== set.rosters[team].length,
      ) ||
      people.some((person) => !known.has(person.id))
    ) {
      errors.push(
        `${label}: select at least six registered participants per team, with no repeats within a team. Include substitutes.`,
      );
    }
    if (
      set.points.some(
        (point) =>
          !teams.includes(point.team) ||
          (point.is_opponent_error
            ? point.player_id !== null || point.player_name !== null
            : !set.rosters[point.team].some((person) => person.id === point.player_id) ||
              !point.player_name),
      )
    ) {
      errors.push(
        `${label}: select a scorer from the correct team, or Opponent’s error, for every point.`,
      );
    }
  });
  return errors;
}

export function replaceParticipant(payload, setIndex, team, position, person) {
  const next = structuredClone(payload);
  const set = next.sets[setIndex];
  const previous = set.rosters[team][position];
  set.rosters[team][position] = { id: person.id, name: person.name };
  set.points = set.points.map((point) =>
    point.team === team && point.player_id === previous.id
      ? { ...point, player_id: person.id, player_name: person.name }
      : point,
  );
  return recount(next);
}

export function editPoint(payload, setIndex, pointIndex, changes) {
  const next = structuredClone(payload);
  const set = next.sets[setIndex];
  const point = set.points[pointIndex];
  if (changes.team !== undefined) {
    point.team = changes.team;
    if (
      !point.is_opponent_error &&
      !set.rosters[point.team].some((person) => person.id === point.player_id)
    ) {
      point.player_id = null;
      point.player_name = null;
    }
  }
  if (changes.scorer !== undefined) {
    point.is_opponent_error = changes.scorer === 'err';
    const person = set.rosters[point.team].find((person) => person.id === changes.scorer);
    point.player_id = point.is_opponent_error ? null : (person?.id ?? null);
    point.player_name = point.is_opponent_error ? null : (person?.name ?? null);
  }
  return recount(next);
}

export function addPoint(payload, setIndex) {
  const next = structuredClone(payload);
  next.sets[setIndex].points.push({
    team: 'A',
    player_id: null,
    player_name: null,
    is_opponent_error: false,
  });
  return recount(next);
}

export function removePoint(payload, setIndex, pointIndex) {
  const next = structuredClone(payload);
  next.sets[setIndex].points.splice(pointIndex, 1);
  return recount(next);
}

function boundary(value, total) {
  if (!Number.isInteger(value) || value < 1 || value >= total)
    throw new Error(`Choose a boundary between points 1 and ${total - 1}.`);
}

export function splitSet(payload, setIndex, afterPoint) {
  const next = structuredClone(payload);
  const set = next.sets[setIndex];
  boundary(afterPoint, set.points.length);
  const following = structuredClone(set);
  following.points = set.points.splice(afterPoint);
  next.sets.splice(setIndex + 1, 0, following);
  return recount(next);
}

export function moveBoundary(payload, setIndex, afterPoint) {
  const next = structuredClone(payload);
  const first = next.sets[setIndex];
  const second = next.sets[setIndex + 1];
  if (!second) throw new Error('Split this set to create a new boundary.');
  const points = [...first.points, ...second.points];
  boundary(afterPoint, points.length);
  first.points = points.slice(0, afterPoint);
  second.points = points.slice(afterPoint);
  return recount(next);
}

export function mergeSets(payload, setIndex) {
  const next = structuredClone(payload);
  const first = next.sets[setIndex];
  const second = next.sets[setIndex + 1];
  if (!second) throw new Error('There is no following set to merge.');
  if (
    teams.some(
      (team) =>
        first.rosters[team]
          .map((person) => person.id)
          .sort()
          .join() !==
        second.rosters[team]
          .map((person) => person.id)
          .sort()
          .join(),
    )
  ) {
    throw new Error(
      'Review the lineups before merging. Both sets must have the same participants on each team.',
    );
  }
  first.points.push(...second.points);
  next.sets.splice(setIndex + 1, 1);
  return recount(next);
}

export function removeEmptySet(payload, setIndex) {
  if (payload.sets.length <= 1 || payload.sets[setIndex].points.length)
    throw new Error('Only empty sets can be removed; keep at least one set.');
  const next = structuredClone(payload);
  next.sets.splice(setIndex, 1);
  return recount(next);
}
