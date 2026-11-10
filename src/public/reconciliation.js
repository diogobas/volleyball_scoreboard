import { recount } from './corrections.js';

export function recordedParticipants(source) {
  const people = new Map();
  for (const [index, set] of source.sets.entries())
    for (const segment of set.segments ?? [])
      for (const team of ['A', 'B']) {
        for (const person of segment.rosters[team]) {
          const previous = people.get(person.key);
          people.set(person.key, {
            ...person,
            team,
            sets: [...new Set([...(previous?.sets ?? []), index + 1])],
          });
        }
      }
  return [...people.values()];
}

export function reconcileSubmission(source, mappings, players) {
  if (source.format_version === 1) return structuredClone(source);
  const known = new Map(players.map((p) => [p.id, p]));
  const person = (key) => {
    const selected = known.get(mappings[key]);
    if (!selected)
      throw new Error('Associate every recorded participant with a registered player.');
    return { id: selected.id, name: selected.name };
  };
  const sets = source.sets.map((set) => {
    const rosters = { A: [], B: [] };
    for (const segment of set.segments) {
      const active = ['A', 'B'].flatMap((team) => segment.rosters[team].map((p) => person(p.key)));
      if (new Set(active.map((p) => p.id)).size !== 12)
        throw new Error(
          'Each active lineup must contain twelve different people. Review the segment mappings.',
        );
      for (const team of ['A', 'B'])
        for (const entry of segment.rosters[team]) {
          const selected = person(entry.key);
          if (!rosters[team].some((p) => p.id === selected.id)) rosters[team].push(selected);
        }
    }
    const points = set.points.map((point) => {
      const selected = point.is_opponent_error ? null : person(point.participant_key);
      return {
        team: point.team,
        player_id: selected?.id ?? null,
        player_name: selected?.name ?? null,
        is_opponent_error: point.is_opponent_error,
      };
    });
    return {
      team_a_name: set.team_a_name,
      team_b_name: set.team_b_name,
      score_a: set.score_a,
      score_b: set.score_b,
      rosters,
      points,
    };
  });
  return recount({
    format_version: 1,
    id: source.id,
    group_id: source.group_id,
    started_at: source.started_at,
    closed_at: source.closed_at,
    team_a_name: source.team_a_name,
    team_b_name: source.team_b_name,
    sets,
  });
}
