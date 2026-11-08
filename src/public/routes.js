const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function publicGroupHref(groupId, { season = null, page = 1, matchId = null, view = matchId ? 'matches' : 'overview' } = {}) {
  const params = new URLSearchParams();
  if (season !== null) params.set('season', season);
  if (page > 1) params.set('page', page);
  if (view !== 'overview') params.set('view', view);
  const query = params.toString();
  return `#/groups/${groupId}${matchId ? `/matches/${matchId}` : ''}${query ? `?${query}` : ''}`;
}

export function readRoute(hash = '', defaultView = 'app') {
  if (hash === '#/admin') return { kind: 'admin' };
  if (hash === '#/app') return { kind: 'app' };
  if (['', '#', '#/'].includes(hash)) return { kind: defaultView === 'public' ? 'groups' : 'app' };
  const [path, query = ''] = hash.slice(1).split('?');
  if (path === '/groups' && !query) return { kind: 'groups' };
  const parts = /^\/groups\/([^/]+)(?:\/matches\/([^/]+))?$/.exec(path);
  if (!parts || !uuid.test(parts[1]) || (parts[2] && !uuid.test(parts[2]))) return { kind: 'missing' };
  const params = new URLSearchParams(query);
  const season = params.has('season') ? Number(params.get('season')) : null;
  const view = params.get('view') ?? (parts[2] ? 'matches' : 'overview');
  if (!['overview', 'players', 'matches'].includes(view)) return { kind: 'missing' };
  const page = params.has('page') ? Number(params.get('page')) : 1;
  if ((season !== null && (!Number.isInteger(season) || season < 1 || season > 9999)) || !Number.isInteger(page) || page < 1 || page > 100000) return { kind: 'missing' };
  return { kind: parts[2] ? 'match' : 'group', groupId: parts[1].toLowerCase(), matchId: parts[2]?.toLowerCase() ?? null, season, page, view };
}
