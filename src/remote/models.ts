import type { TeamId, TeamMap } from '../game/types';

export interface Community {
  id: string;
  name: string;
  region: string;
  display_id?: string;
  role?: string;
  version?: number;
}

export interface Group {
  id: string;
  name: string;
  time_zone: string;
  community_id?: string;
  community?: Community;
  display_id?: string;
  role?: string;
  can_import_community_players?: boolean;
}

export interface RegisteredPlayer {
  id: string;
  name: string;
  group_id: string;
  display_id?: string;
  category?: string;
  sex?: string | null;
  preferred_positions?: string[];
  version?: number;
  person_id?: string;
  community_id?: string;
  deleted_at?: string | null;
}

export interface PlayerRegistrySnapshot {
  group: Group;
  players: RegisteredPlayer[];
  deleted_player_ids?: string[];
}

export interface PlayerSyncResponse {
  status: 'saved' | 'name_conflict' | 'identity_conflict';
  player: RegisteredPlayer;
}

export interface Participant {
  id: string;
  name: string;
}
export interface SubmittedPoint {
  team: TeamId;
  player_id: string | null;
  player_name: string | null;
  is_opponent_error: boolean;
}
export interface SubmittedSet {
  team_a_name: string;
  team_b_name: string;
  score_a: number;
  score_b: number;
  rosters: TeamMap<Participant[]>;
  points: SubmittedPoint[];
}
export interface MatchSubmission {
  format_version: 1;
  id: string;
  group_id: string;
  started_at: string | null;
  closed_at: string;
  team_a_name: string;
  team_b_name: string;
  sets: SubmittedSet[];
}

export interface RecordedParticipant {
  key: string;
  name: string;
  hint_id: string | null;
  slot: string;
}
export interface RecordedPoint {
  team: TeamId;
  participant_key: string | null;
  player_name: string | null;
  is_opponent_error: boolean;
}
export interface RecordedSet {
  team_a_name: string;
  team_b_name: string;
  score_a: number;
  score_b: number;
  segments: { from_point: number; rosters: TeamMap<RecordedParticipant[]> }[];
  points: RecordedPoint[];
}
export interface RecordedSubmission {
  format_version: 2;
  id: string;
  day_id: string;
  group_id: string;
  lineup_version: number | null;
  started_at: string | null;
  closed_at: string;
  team_a_name: string;
  team_b_name: string;
  sets: RecordedSet[];
}

export interface HistoricalPlayer {
  player_id: string | null;
  name: string;
  team: TeamId;
  result_team?: TeamId | null;
  points: number | string;
}
export interface HistoricalSet {
  score_a: number | string;
  score_b: number | string;
  early_finish?: boolean;
}
export interface HistoricalPayload {
  format_version?: number;
  id?: string;
  group_id?: string;
  played_on: string;
  rules: string;
  ended_as_draw?: boolean;
  player_totals_recorded?: boolean;
  team_a_name: string;
  team_b_name: string;
  errors_a: number | string;
  errors_b: number | string;
  sets: HistoricalSet[];
  players: HistoricalPlayer[];
}

export interface Administrator {
  user_id: string;
  email: string;
}
export interface PlayerStatistics {
  points: number;
  wins: number;
  matches: number;
  days: number;
  attendance_day_count: number;
}
export interface PublicPlayer extends RegisteredPlayer, PlayerStatistics {
  preferred_positions: string[];
  removed?: boolean;
}
export interface PublicMatchPlayer extends Participant {
  team: TeamId;
  points: number;
  position?: number;
}
export interface PublicSet {
  number: number;
  score_a: number;
  score_b: number;
  team_a_name: string;
  team_b_name: string;
  players: PublicMatchPlayer[];
  errors_a: number;
  errors_b: number;
  training?: boolean;
  early_finish?: boolean;
  statistics_available?: boolean;
}
export interface PublicMatch {
  id: string;
  group_id: string;
  group: Group;
  version: number;
  started_at: string | null;
  closed_at: string;
  team_a_name: string;
  team_b_name: string;
  sets: PublicSet[];
  sets_a?: number;
  sets_b?: number;
  played_on?: string;
  entry_mode?: string;
  rules?: string;
  player_totals_recorded?: boolean;
  players: PublicMatchPlayer[];
  errors_a: number;
  errors_b: number;
  winner?: TeamId | null;
  decided_at?: number | null;
  ended_as_draw?: boolean;
  draw_interrupted_set?: number | null;
  player_points?: number;
  player_result?: string;
}
export interface PublicGroupSummary {
  group: Group;
  players: PublicPlayer[];
  matches: PublicMatch[];
  seasons: number[];
  season: number;
  period?: string;
  page: number;
  page_size: number;
  match_count: number;
  point_count: number;
  participant_count: number;
  fallback_dates: number;
  attendance_day_count: number;
  unattributed_matches: number;
}
export interface PublicCommunity {
  community: Community;
  groups: Group[];
}
export interface PublicPlayerProfile {
  group: Group;
  player: PublicPlayer;
  statistics: PlayerStatistics;
  matches: PublicMatch[];
  seasons: number[];
  season: number;
  period: string;
  page: number;
  page_size: number;
  match_count: number;
}
export interface EditableMatch {
  group: Group;
  payload: MatchSubmission;
  players: RegisteredPlayer[];
  version: number;
}
export interface CorrectionReceipt {
  status: string;
  match_id: string;
  group_id: string;
  revision_id: string;
  version: number;
  current_version: number;
}
export interface MatchList {
  group: Group;
  matches: PublicMatch[];
  seasons: number[];
  total: number;
  page: number;
  page_size: number;
  period?: string;
}
export interface Revision {
  id: string;
  version: number;
  author_email?: string;
  author_id: string;
  created_at: string;
  reason: string;
  previous_snapshot: MatchSubmission;
  new_snapshot: MatchSubmission;
}
export interface RevisionHistory {
  match_id: string;
  group_id: string;
  page: number;
  page_size: number;
  revisions: Revision[];
  total: number;
}
export interface DayLineupTeam {
  name: string;
  players: (Participant | null)[];
}
export type DayLineup = TeamMap<DayLineupTeam>;
export interface GameDay {
  id: string;
  group_id: string;
  play_date: string;
  state: string;
  version: number;
  lineup_version: number;
  pending?: number;
  published_count?: number;
  team_a_name?: string;
  team_b_name?: string;
}
export interface GameDayDetails {
  day: GameDay;
  lineup: DayLineup | null;
  receipts: { decision: string }[];
  lineups: {
    version: number;
    created_at: string;
    lineup: TeamMap<{ name: string; players: Participant[] }>;
  }[];
  history: {
    version: number;
    author_id: string;
    created_at: string;
    reason: string;
    previous_state: { state: string };
    new_state: { state: string; action: string };
  }[];
}
export interface CommunityPlayers {
  players: (RegisteredPlayer & {
    group_names?: string[];
    already_in_group?: boolean;
    groups: Group[];
  })[];
  total: number;
  page: number;
  page_size: number;
}
export interface SubmitMatchReceipt {
  status: string;
  match_id: string;
  group_id: string;
  version: number;
  submission: MatchSubmission;
}
export interface ReceiveMatchReceipt {
  status: 'received' | 'already_received';
  match_id: string;
  day_id: string;
  published?: boolean;
  deleted?: boolean;
  submission: MatchSubmission | RecordedSubmission;
}
