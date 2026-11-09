async function clientFor(supplied) {
  const client = supplied ?? (await import('./client.js')).getPublicClient();
  if (!client) throw new Error('Public results are not configured for this build.');
  return client;
}


async function resolveGroupId(groupId, client) {
  if (!/^G-[1-9][0-9]{0,18}$/i.test(groupId)) return groupId;
  const { data, error } = await client.rpc('public_group_info', { p_group_ref: groupId.toUpperCase() });
  if (error) throw error;
  if (!data?.id) throw new Error('Group not found.');
  return data.id;
}

export async function publicCommunity(communityId, suppliedClient) {
  const client = await clientFor(suppliedClient);
  const { data, error } = await client.rpc('public_community', { p_community_ref: communityId });
  if (error) throw error;
  if (!data?.community?.id || ![data.community.id.toLowerCase(), data.community.display_id?.toLowerCase()].includes(communityId.toLowerCase()) || !Array.isArray(data.groups)) throw new Error('The community response was incomplete. Refresh to try again.');
  return data;
}

export async function publicGroupSummary(groupId, season = null, page = 1, suppliedClient, pageSize = 25, period) {
  if (!Number.isInteger(page) || page < 1 || page > 100000 || ![5,10,25].includes(pageSize)) throw new Error('Invalid match page or page size.');
  const client = await clientFor(suppliedClient);
  groupId = await resolveGroupId(groupId, client);
  async function read(serverPage, selectedSeason) {
    const { data, error } = await client.rpc(period ? 'public_group_period_summary' : 'public_group_summary', { p_group_id: groupId, p_season: selectedSeason, p_page: serverPage, ...(period ? { p_period: period } : {}) });
    if (error) throw error;
    if (data?.group?.id !== groupId || !Array.isArray(data.players) || !Array.isArray(data.matches) || !Array.isArray(data.seasons) ||
        !Number.isInteger(data.season) || (selectedSeason !== null && data.season !== selectedSeason) || (period && data.period !== period) || data.page !== serverPage || data.page_size !== 25 || !Number.isInteger(data.match_count)) {
      throw new Error('The public results response was incomplete. Refresh to try again.');
    }
    return data;
  }
  // Summary RPCs return batches of 25. Read only the one or two batches
  // needed for the selected display page; totals cover the full selected period.
  const offset = (page - 1) * pageSize;
  const serverPage = Math.floor(offset / 25) + 1;
  const start = offset % 25;
  const data = await read(serverPage, season);
  let matches = data.matches;
  if (start + pageSize > 25 && offset + (25 - start) < data.match_count) {
    const following = await read(serverPage + 1, data.season);
    if (following.match_count !== data.match_count) throw new Error('Published matches changed while loading. Refresh to try again.');
    matches = [...matches, ...following.matches];
  }
  data.players.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  return { ...data, page, page_size: pageSize, matches: matches.slice(start, start + pageSize) };
}

export async function publicMatchDetails(groupId, matchId, suppliedClient) {
  const client = await clientFor(suppliedClient);
  groupId = await resolveGroupId(groupId, client);
  const { data, error } = await client.rpc('public_match_details', { p_group_id: groupId, p_match_id: matchId });
  if (error) throw error;
  if (data?.id !== matchId || data.group_id !== groupId || data.group?.id !== groupId || !Array.isArray(data.sets)) {
    throw new Error('The match response was incomplete. Refresh to try again.');
  }
  return data;
}

export async function publicPlayerProfile(groupId, playerId, { season = null, period = 'all', page = 1, pageSize = 5 } = {}, suppliedClient) {
  if (!Number.isInteger(page) || page < 1 || page > 100000 || ![5, 10, 25].includes(pageSize)) throw new Error('Invalid player match page.');
  const client = await clientFor(suppliedClient);
  groupId = await resolveGroupId(groupId, client);
  const { data, error } = await client.rpc('public_player_profile', { p_group_id: groupId, p_player_ref: playerId, p_season: season, p_period: period, p_page: page, p_page_size: pageSize });
  if (error) throw error;
  if (data?.group?.id !== groupId || !data.player?.id || ![data.player.id.toLowerCase(), data.player.display_id?.toLowerCase()].includes(playerId.toLowerCase()) ||
      !data.statistics || !Array.isArray(data.matches) || !Array.isArray(data.seasons) || !Array.isArray(data.player.preferred_positions) ||
      !Number.isInteger(data.season) || (season !== null && data.season !== season) || data.period !== period || data.page !== page || data.page_size !== pageSize || !Number.isInteger(data.match_count)) {
    throw new Error('The player profile response was incomplete. Refresh to try again.');
  }
  return data;
}
