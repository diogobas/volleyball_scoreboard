async function clientFor(supplied) {
  const client = supplied ?? (await import('./client.js')).getPublicClient();
  if (!client) throw new Error('Public results are not configured for this build.');
  return client;
}


async function resolveGroupId(groupId, client) {
  if (!/^G-[1-9][0-9]{0,18}$/i.test(groupId)) return groupId;
  const { data, error } = await client.from('groups').select('id').eq('display_id', groupId.toUpperCase()).maybeSingle();
  if (error) throw error;
  if (!data?.id) throw new Error('Group not found.');
  return data.id;
}

export async function listPublicGroups(suppliedClient) {
  const client = await clientFor(suppliedClient);
  const groups = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from('groups').select('id,name,time_zone,display_id').order('id').range(offset, offset + 99);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('The public group list could not be read.');
    groups.push(...data);
    if (data.length < 100) break;
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

export async function publicGroupSummary(groupId, season = null, page = 1, suppliedClient, pageSize = 25) {
  if (!Number.isInteger(page) || page < 1 || page > 100000 || ![5,10,25].includes(pageSize)) throw new Error('Invalid match page or page size.');
  const client = await clientFor(suppliedClient);
  groupId = await resolveGroupId(groupId, client);
  async function read(serverPage, selectedSeason) {
    const { data, error } = await client.rpc('public_group_summary', { p_group_id: groupId, p_season: selectedSeason, p_page: serverPage });
    if (error) throw error;
    if (data?.group?.id !== groupId || !Array.isArray(data.players) || !Array.isArray(data.matches) || !Array.isArray(data.seasons) ||
        !Number.isInteger(data.season) || (selectedSeason !== null && data.season !== selectedSeason) || data.page !== serverPage || data.page_size !== 25 || !Number.isInteger(data.match_count)) {
      throw new Error('The public results response was incomplete. Refresh to try again.');
    }
    return data;
  }
  // The existing RPC returns batches of 25. Read only the one or two batches
  // needed for the selected display page, keeping the deployed database unchanged.
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
