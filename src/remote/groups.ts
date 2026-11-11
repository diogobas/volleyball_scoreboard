import type { RpcClient, RpcResults } from './transport';
import { requestRpc } from './transport';
export const remoteGroups = (client: RpcClient) => {
  const rpc = async <K extends keyof RpcResults & string>(
    name: K,
    args?: Record<string, unknown>,
  ) => {
    const { data, error } = await requestRpc(client, name, args);
    if (error) throw error;
    return data;
  };
  return {
    list: () => rpc('list_my_groups'),
    create: async (name: string, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone) => {
      const rows = await rpc('create_group', { p_name: name.trim(), p_time_zone: timeZone.trim() });
      if (!rows?.[0])
        throw new Error(
          'The group could not be confirmed. Refresh your groups before trying again.',
        );
      return rows[0];
    },
    createInCommunity: async (name: string, communityId: string) => {
      const group = await rpc('create_community_group', {
        p_community_id: communityId,
        p_name: name.trim(),
        p_time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      if (!group?.id || group.community_id !== communityId)
        throw new Error(
          'The new group could not be confirmed in this community. Refresh before trying again.',
        );
      return group;
    },
    administrators: (groupId: string) => rpc('list_group_admins', { p_group_id: groupId }),
    authorize: (groupId: string, email: string) =>
      rpc('grant_group_admin', { p_group_id: groupId, p_email: email.trim().toLowerCase() }),
    revoke: (groupId: string, userId: string) =>
      rpc('revoke_group_admin', { p_group_id: groupId, p_user_id: userId }),
  };
};
