import type { MatchSubmission } from '../remote/models';

// Fake servers use this argument bag to inspect requests, including negative fixtures.
export interface TestRpcArgs<T = MatchSubmission> extends Record<string, unknown> {
  p_group_id: string;
  p_group_ref: string;
  p_match_id: string;
  p_match: T;
  p_code: string;
  p_revision_id: string;
  p_expected_version: number;
  p_page: number;
  p_page_size: number;
  p_season: number | null;
  p_period: string;
  p_player_id: string;
  p_name: string;
}
export type RpcCall = [name: string, args: TestRpcArgs];
