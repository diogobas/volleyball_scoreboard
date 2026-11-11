import type { DayContext } from '../game/types';
import type * as Models from './models';

export interface RegistryConnection {
  client: RegistryClient | null;
  userId: string | null;
  session: RegistrySession | null;
}
export interface RpcResponse<T = unknown> {
  data?: T;
  error?: unknown;
}
export interface TypedRpcRequest<T> extends PromiseLike<{ data: T; error?: unknown }> {
  abortSignal?: (signal: AbortSignal) => TypedRpcRequest<T>;
}
export interface RpcRequest extends PromiseLike<RpcResponse> {
  abortSignal?: (signal: AbortSignal) => RpcRequest;
}
export interface RpcClient {
  rpc(name: string, args?: Record<string, unknown>): RpcRequest;
}
export interface RegistrySession {
  user: { id: string; email?: string };
}
export interface RegistryClient extends RpcClient {
  auth: {
    getSession: () => Promise<{ data: { session: RegistrySession | null }; error?: unknown }>;
  };
}

export interface RpcResults {
  grant_group_admin: unknown;
  revoke_group_admin: unknown;
  grant_community_admin: unknown;
  revoke_community_admin: unknown;
  import_community_players: unknown;
  edit_game_day: unknown;
  delete_game_day: unknown;
  delete_group_player: unknown;
  delete_final_match: unknown;
  list_my_groups: Models.Group[];
  list_my_communities: Models.Community[];
  create_group: Models.Group[];
  create_community_group: Models.Group;
  create_community: Models.Community;
  list_group_admins: Models.Administrator[];
  list_community_admins: Models.Administrator[];
  list_community_players: Models.CommunityPlayers;
  get_group_registry: Models.PlayerRegistrySnapshot;
  sync_group_player: Models.PlayerSyncResponse;
  public_group_info: Models.Group;
  public_community: Models.PublicCommunity;
  public_group_summary: Models.PublicGroupSummary;
  public_group_period_summary: Models.PublicGroupSummary;
  public_match_details: Models.PublicMatch;
  public_player_profile: Models.PublicPlayerProfile;
  get_match_for_edit: Models.EditableMatch;
  correct_match: Models.CorrectionReceipt;
  match_revision_history: Models.RevisionHistory;
  list_group_matches: Models.MatchList;
  list_group_period_matches: Models.MatchList;
  redeem_day_code: Omit<DayContext, 'code'>;
  receive_day_match: Models.ReceiveMatchReceipt;
  submit_match: Models.SubmitMatchReceipt;
  list_game_days: Models.GameDay[];
  get_game_day: Models.GameDayDetails;
  create_game_day: { day: Models.GameDay; code?: string };
  change_game_day: { day: Models.GameDay; code?: string };
  get_historical_match: { payload: Models.HistoricalPayload; version: number };
  save_historical_match: { id: string; version: number };
  save_group_player_profile: Models.RegisteredPlayer;
}

export const requestRpc = <K extends keyof RpcResults & string>(
  client: RpcClient,
  name: K,
  args?: Record<string, unknown>,
): TypedRpcRequest<RpcResults[K]> => client.rpc(name, args) as TypedRpcRequest<RpcResults[K]>;
