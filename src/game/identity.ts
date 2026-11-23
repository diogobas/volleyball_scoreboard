import { restoreMatch } from './match';
import type { LocalGroup, LocalPlayer } from './registryTypes';
import type { MatchState } from './types';

export const canonicalMatch = (
  state: MatchState,
  groups: LocalGroup[],
  players: LocalPlayer[],
): MatchState => {
  if (!state.groupId) return state;
  let groupId = state.groupId;
  const seenGroups = new Set();
  while (groups.find((group) => group.id === groupId)?.linkedTo) {
    if (seenGroups.has(groupId)) throw new Error('Invalid group link');
    seenGroups.add(groupId);
    groupId = groups.find((group) => group.id === groupId)!.linkedTo!;
  }
  const aliases = new Map(
    players
      .filter((player) => player.groupId === groupId && player.canonicalId)
      .map((player) => [player.id, player.canonicalId]),
  );
  let changed = groupId !== state.groupId;
  const rewrite = <T>(value: T): T => {
    if (Array.isArray(value)) return value.map(rewrite) as T;
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.entries(value).map(([key, original]) => {
        if (key !== 'personId' || typeof original !== 'string') return [key, rewrite(original)];
        let id = original;
        const visited = new Set();
        while (aliases.has(id)) {
          if (visited.has(id)) throw new Error('Invalid player identity link');
          visited.add(id);
          id = aliases.get(id)!;
        }
        if (id !== original) changed = true;
        return [key, id];
      }),
    ) as T;
  };
  const next = rewrite(state);
  next.groupId = groupId;
  return changed ? restoreMatch(JSON.stringify(next)) : state;
};
