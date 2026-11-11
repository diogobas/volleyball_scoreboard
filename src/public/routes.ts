import type { AppRoute, GroupHrefOptions } from './routeTypes';
const playerReference = /^P-[1-9][0-9]{0,18}$/i;
const communityReference = /^C-[1-9][0-9]{0,18}$/i;
const groupReference = /^G-[1-9][0-9]{0,18}$/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const publicGroupHref = (
  groupId: string,
  {
    season = null,
    page = 1,
    matchId = null,
    view = matchId ? 'matches' : 'overview',
    pageSize = 5,
    period,
  }: GroupHrefOptions = {},
) => {
  const params = new URLSearchParams();
  if (period) params.set('period', period);
  if (season !== null) params.set('season', String(season));
  if (page > 1) params.set('page', String(page));
  if (pageSize !== 5) params.set('size', String(pageSize));
  if (view !== 'overview') params.set('view', view);
  const query = params.toString();
  return `#/groups/${groupId}${matchId ? `/matches/${matchId}` : ''}${query ? `?${query}` : ''}`;
};

export const publicPlayerHref = (
  groupId: string,
  playerId: string,
  options: GroupHrefOptions = {},
) => {
  return publicGroupHref(groupId, { ...options, matchId: null, view: 'players' }).replace(
    `/groups/${groupId}`,
    `/groups/${groupId}/players/${playerId}`,
  );
};

export const publicCommunityHref = (id: string) => {
  return `#/communities/${id}`;
};

export const readRoute = (hash = '', defaultView = 'app'): AppRoute => {
  if (hash === '#/admin') return { kind: 'admin' };
  if (hash === '#/app') return { kind: 'app' };
  if (['', '#', '#/'].includes(hash))
    return { kind: defaultView === 'public' ? 'directory' : 'app' };
  const [path, query = ''] = hash.slice(1).split('?');
  if (['/groups', '/communities'].includes(path) && !query) return { kind: 'directory' };
  const community = /^\/communities\/([^/]+)$/.exec(path);
  if (community && !query && (uuid.test(community[1]) || communityReference.test(community[1])))
    return {
      kind: 'community',
      communityId: community[1].toUpperCase().startsWith('C-')
        ? community[1].toUpperCase()
        : community[1].toLowerCase(),
    };
  const parts = /^\/groups\/([^/]+)(?:\/(matches|players)\/([^/]+))?$/.exec(path);
  if (
    !parts ||
    (!uuid.test(parts[1]) && !groupReference.test(parts[1])) ||
    (parts[3] &&
      !(uuid.test(parts[3]) || (parts[2] === 'players' && playerReference.test(parts[3]))))
  )
    return { kind: 'missing' };
  const params = new URLSearchParams(query);
  const season = params.has('season') ? Number(params.get('season')) : null;
  const period = params.get('period');
  if (period !== null && !['all', 'winter', 'spring', 'summer', 'fall'].includes(period))
    return { kind: 'missing' };
  const view =
    params.get('view') ??
    (parts[2] === 'players' ? 'players' : parts[2] === 'matches' ? 'matches' : 'overview');
  if (!['overview', 'players', 'matches'].includes(view)) return { kind: 'missing' };
  const pageSize = params.has('size') ? Number(params.get('size')) : 5;
  if (![5, 10, 25].includes(pageSize)) return { kind: 'missing' };
  const page = params.has('page') ? Number(params.get('page')) : 1;
  if (
    (season !== null && (!Number.isInteger(season) || season < 1 || season > 9999)) ||
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000
  )
    return { kind: 'missing' };
  const common = {
    groupId: groupReference.test(parts[1]) ? parts[1].toUpperCase() : parts[1].toLowerCase(),
    season,
    page,
    view,
    pageSize,
    ...(period ? { period } : {}),
  };
  if (parts[2] === 'players')
    return {
      ...common,
      kind: 'player',
      matchId: null,
      playerId: playerReference.test(parts[3]) ? parts[3].toUpperCase() : parts[3].toLowerCase(),
    };
  if (parts[2] === 'matches') return { ...common, kind: 'match', matchId: parts[3].toLowerCase() };
  return { ...common, kind: 'group', matchId: null };
};
