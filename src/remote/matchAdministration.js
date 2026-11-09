async function connection(supplied) {
  if (globalThis.navigator?.onLine === false) throw new Error('Corrections require an internet connection. Your draft has been kept.');
  const client = supplied ?? (await import('./client.js')).getAdminClient();
  if (!client) throw new Error('Online administration is not configured.');
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) throw new Error('Sign in as a group administrator first.');
  return { client, userId: data.session.user.id };
}

async function rpc(name, args, supplied) {
  const controller = new AbortController();
  const timeoutError = new Error('The server response timed out. Keep your draft and retry the same correction to confirm whether it was saved.');
  let abortListener;
  const aborted = new Promise((_, reject) => {
    abortListener = () => reject(timeoutError);
    controller.signal.addEventListener('abort', abortListener, { once: true });
  });
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    return await Promise.race([(async () => {
      const { client, userId } = await connection(supplied);
      controller.signal.throwIfAborted();
      let request = client.rpc(name, args);
      if (request.abortSignal) request = request.abortSignal(controller.signal);
      const { data, error } = await request;
      controller.signal.throwIfAborted();
      if (error) throw error;
      const current = await client.auth.getSession();
      controller.signal.throwIfAborted();
      if (current.error || current.data.session?.user.id !== userId) throw new Error('The signed-in account changed. Reload the administrator tools before continuing.');
      return data;
    })(), aborted]);
  } finally {
    clearTimeout(timer); controller.signal.removeEventListener('abort', abortListener);
  }
}

export async function getMatchForEdit(groupId, matchId, supplied) {
  const data = await rpc('get_match_for_edit', { p_group_id: groupId, p_match_id: matchId }, supplied);
  if (data?.group?.id !== groupId || data.payload?.id !== matchId || data.payload?.group_id !== groupId || data.payload?.format_version !== 1 ||
      !Number.isInteger(data.version) || data.version < 1 || !Array.isArray(data.players) || !Array.isArray(data.payload?.sets)) {
    throw new Error('The editable match response was incomplete. Reload before making changes.');
  }
  return data;
}

export async function correctMatch({ groupId, matchId, version, payload, reason, revisionId }, supplied) {
  if (!reason.trim() || reason.trim().length > 500) throw new Error('Provide a reason with 1–500 characters.');
  const data = await rpc('correct_match', { p_group_id: groupId, p_match_id: matchId, p_expected_version: version,
    p_match: payload, p_reason: reason.trim(), p_revision_id: revisionId }, supplied);
  if (!['corrected', 'already_corrected'].includes(data?.status) || data.match_id !== matchId || data.group_id !== groupId || data.revision_id !== revisionId ||
      data.version !== version + 1 || !Number.isInteger(data.current_version) || data.current_version < data.version) {
    throw new Error('The correction confirmation was incomplete. Keep your draft and retry the same correction to confirm it.');
  }
  return data;
}

export async function matchRevisionHistory(groupId, matchId, page = 1, supplied) {
  const data = await rpc('match_revision_history', { p_group_id: groupId, p_match_id: matchId, p_page: page }, supplied);
  if (data?.match_id !== matchId || data.group_id !== groupId || data.page !== page || data.page_size !== 20 || !Array.isArray(data.revisions) || !Number.isInteger(data.total)) {
    throw new Error('The private revision history was incomplete. Retry to load it.');
  }
  return data;
}

export async function listGroupMatches(groupId, { season = null, dayId = null, query = '', page = 1, pageSize = 5, period } = {}, supplied) {
  const data = await rpc(period ? 'list_group_period_matches' : 'list_group_matches', { p_group_id: groupId, p_season: season, p_day_id: dayId, p_query: query, p_page: page, p_page_size: pageSize, ...(period ? { p_period: period } : {}) }, supplied);
  if (data?.group?.id !== groupId || !Array.isArray(data.matches) || !Array.isArray(data.seasons) || !Number.isInteger(data.total) || !Number.isInteger(data.page) || data.page_size !== pageSize || (period && data.period !== period)) throw new Error('Matches could not be loaded. Refresh and try again.');
  return data;
}

export async function deleteFinalMatch(groupId, match, reason, supplied) {
  if (!reason.trim()) throw new Error('Provide a reason for deleting the match.');
  await rpc('delete_final_match', { p_group_id: groupId, p_match_id: match.id, p_expected_version: match.version, p_reason: reason.trim() }, supplied);
}
