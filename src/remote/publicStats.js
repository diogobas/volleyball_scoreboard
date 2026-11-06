async function clientFor(supplied) {
  const client = supplied ?? (await import('./client.js')).getPublicClient();
  if (!client) throw new Error('Public results are not configured for this build.');
  return client;
}

export async function listPublicGroups(suppliedClient) {
  const client = await clientFor(suppliedClient);
  const groups = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from('groups').select('id,name,time_zone').order('id').range(offset, offset + 99);
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error('The public group list could not be read.');
    groups.push(...data);
    if (data.length < 100) break;
  }
  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

export async function publicGroupSummary(groupId, season = null, page = 1, suppliedClient) {
  const client = await clientFor(suppliedClient);
  const { data, error } = await client.rpc('public_group_summary', { p_group_id: groupId, p_season: season, p_page: page });
  if (error) throw error;
  if (data?.group?.id !== groupId || !Array.isArray(data.players) || !Array.isArray(data.matches) || !Array.isArray(data.seasons) ||
      !Number.isInteger(data.season) || (season !== null && data.season !== season) || data.page !== page || data.page_size !== 25 || !Number.isInteger(data.match_count)) {
    throw new Error('The public results response was incomplete. Refresh to try again.');
  }
  data.players.sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name, 'pt', { sensitivity: 'base' }) || a.id.localeCompare(b.id));
  return data;
}

export async function publicMatchDetails(groupId, matchId, suppliedClient) {
  const client = await clientFor(suppliedClient);
  const { data, error } = await client.rpc('public_match_details', { p_group_id: groupId, p_match_id: matchId });
  if (error) throw error;
  if (data?.id !== matchId || data.group_id !== groupId || data.group?.id !== groupId || !Array.isArray(data.sets)) {
    throw new Error('The match response was incomplete. Refresh to try again.');
  }
  return data;
}
