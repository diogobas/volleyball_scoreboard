export function remoteCommunities(client) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  return {
    list: () => rpc('list_my_communities'),
    create: (name, region) =>
      rpc('create_community', { p_name: name.trim(), p_region: region.trim() }),
    administrators: (id) => rpc('list_community_admins', { p_community_id: id }),
    authorize: (id, email) =>
      rpc('grant_community_admin', { p_community_id: id, p_email: email.trim().toLowerCase() }),
    revoke: (id, userId) =>
      rpc('revoke_community_admin', { p_community_id: id, p_user_id: userId }),
    players: (id, query = '', page = 1) =>
      rpc('list_community_players', { p_community_id: id, p_query: query, p_page: page }),
    importPlayers: (groupId, ids, category) =>
      rpc('import_community_players', {
        p_group_id: groupId,
        p_person_ids: ids,
        p_category: category,
      }),
  };
}
