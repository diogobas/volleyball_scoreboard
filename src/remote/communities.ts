import type { RpcClient, RpcResults } from './transport';
import { requestRpc } from './transport';
export const remoteCommunities = (client: RpcClient) => {
  const rpc = async <K extends keyof RpcResults & string>(
    name: K,
    args?: Record<string, unknown>,
  ) => {
    const { data, error } = await requestRpc(client, name, args);
    if (error) throw error;
    return data;
  };
  return {
    list: () => rpc('list_my_communities'),
    create: (name: string, region: string) =>
      rpc('create_community', { p_name: name.trim(), p_region: region.trim() }),
    administrators: (id: string) => rpc('list_community_admins', { p_community_id: id }),
    authorize: (id: string, email: string) =>
      rpc('grant_community_admin', { p_community_id: id, p_email: email.trim().toLowerCase() }),
    revoke: (id: string, userId: string) =>
      rpc('revoke_community_admin', { p_community_id: id, p_user_id: userId }),
    players: (id: string, query = '', page = 1) =>
      rpc('list_community_players', { p_community_id: id, p_query: query, p_page: page }),
    importPlayers: (groupId: string, ids: string[], category: string) =>
      rpc('import_community_players', {
        p_group_id: groupId,
        p_person_ids: ids,
        p_category: category,
      }),
  };
};
