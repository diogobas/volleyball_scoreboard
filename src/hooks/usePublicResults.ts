import { useEffect, useState } from 'react';
import { errorMessage } from '../game/errors';
import { currentPeriod } from '../game/seasonPeriods';
import type { PublicRoute } from '../public/routeTypes';
import type {
  PublicCommunity,
  PublicGroupSummary,
  PublicMatch,
  PublicPlayerProfile,
} from '../remote/models';
import {
  publicCommunity,
  publicGroupSummary,
  publicMatchDetails,
  publicPlayerProfile,
} from '../remote/publicStats';
export type PublicResultsData =
  PublicCommunity | PublicGroupSummary | PublicMatch | PublicPlayerProfile;

export interface PublicResultsServices {
  community: typeof publicCommunity;
  group: typeof publicGroupSummary;
  match: typeof publicMatchDetails;
  player: typeof publicPlayerProfile;
}

const services: PublicResultsServices = {
  community: publicCommunity,
  group: publicGroupSummary,
  match: publicMatchDetails,
  player: publicPlayerProfile,
};

export const usePublicResults = (route: PublicRoute, dependencies = services) => {
  const groupId = 'groupId' in route ? route.groupId : undefined;
  const communityId = route.kind === 'community' ? route.communityId : undefined;
  const matchId = route.kind === 'match' ? route.matchId : undefined;
  const playerId = route.kind === 'player' ? route.playerId : undefined;
  const season = 'season' in route ? route.season : null;
  const page = 'page' in route ? route.page : undefined;
  const pageSize = 'pageSize' in route ? route.pageSize : undefined;
  const [data, setData] = useState<PublicResultsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const period = ('period' in route ? route.period : undefined) ?? currentPeriod();
  useEffect(() => {
    if (!['community', 'group', 'match', 'player'].includes(route.kind)) return;
    let active = true;
    setLoading(true);
    setError('');
    const request =
      route.kind === 'player'
        ? dependencies.player(groupId!, playerId!, {
            season: season,
            period,
            page: page,
            pageSize: pageSize,
          })
        : route.kind === 'community'
          ? dependencies.community(communityId!)
          : route.kind === 'match'
            ? dependencies.match(groupId!, matchId!)
            : dependencies.group(groupId!, season, page, undefined, pageSize, period);
    request
      .then((result) => {
        if (active) setData(result);
      })
      .catch((failure) => {
        if (active)
          setError(
            errorMessage(failure) ||
              'Results could not be loaded. Check your connection and retry.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [
    route.kind,
    communityId,
    groupId,
    matchId,
    playerId,
    season,
    page,
    pageSize,
    period,
    attempt,
    dependencies,
  ]);
  const refresh = () => setAttempt((value) => value + 1);
  return { data, error, loading, period, refresh };
};
