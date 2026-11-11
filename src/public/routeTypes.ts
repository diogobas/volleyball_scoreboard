export interface GroupHrefOptions {
  season?: number | null;
  page?: number;
  matchId?: string | null;
  view?: string;
  pageSize?: number;
  period?: string;
}

export interface GroupRouteBase {
  groupId: string;
  season: number | null;
  page: number;
  pageSize: number;
  view: string;
  period?: string;
}
export type GroupRoute = GroupRouteBase &
  (
    | { kind: 'group'; matchId: null }
    | { kind: 'match'; matchId: string }
    | { kind: 'player'; playerId: string; matchId: null }
  );
export type PublicRoute =
  | GroupRoute
  | { kind: 'community'; communityId: string }
  | { kind: 'directory' }
  | { kind: 'missing' };
export type AppRoute = PublicRoute | { kind: 'app' } | { kind: 'admin' };
