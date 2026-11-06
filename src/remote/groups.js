export function remoteGroups(client) {
  async function rpc(name, args) {
    const { data, error } = await client.rpc(name, args);
    if (error) throw error;
    return data;
  }
  return {
    list: () => rpc('list_my_groups'),
    create: async (name, timeZone) => {
      const rows = await rpc('create_group', { p_name: name.trim(), p_time_zone: timeZone.trim() });
      if (!rows?.[0]) throw new Error('The group could not be confirmed. Refresh your groups before trying again.');
      return rows[0];
    },
    administrators: groupId => rpc('list_group_admins', { p_group_id: groupId }),
    authorize: (groupId, email) => rpc('grant_group_admin', { p_group_id: groupId, p_email: email.trim().toLowerCase() }),
    revoke: (groupId, userId) => rpc('revoke_group_admin', { p_group_id: groupId, p_user_id: userId }),
  };
}
