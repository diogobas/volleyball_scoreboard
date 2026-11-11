export type TeamId = 'A' | 'B';
export type TeamMap<T> = Record<TeamId, T>;

export interface RosterPlayer {
  id: string;
  name: string;
  personId?: string;
}

export interface Player extends RosterPlayer {
  isError: boolean;
  setPoints: number;
  matchPoints: number;
}

export interface Team {
  name: string;
  setsWon: number;
  players: Player[];
}

export interface DayContext {
  code: string;
  day_id: string;
  group_id: string;
  group_name: string;
  play_date: string;
  lineup_version: number;
  lineup: TeamMap<{ name: string; players: { id: string; name: string }[] }>;
}

export interface PointEvent {
  type: 'point';
  team: TeamId;
  playerId: string;
  personId?: string;
  playerName: string;
  teamName: string;
}

export interface SetEvent {
  type: 'set';
  setNumber: number;
  scoreA: number;
  scoreB: number;
  teamAName: string;
  teamBName: string;
  rosters?: TeamMap<RosterPlayer[]>;
  sidesSwappedBefore?: boolean;
  snapshots: TeamMap<{ setsWon: number; points: number[] }>;
}

export interface RosterEvent {
  type: 'roster';
  setNumber: number;
  previousRosters: TeamMap<RosterPlayer[]>;
  rosters: TeamMap<RosterPlayer[]>;
}

export type MatchEvent = PointEvent | SetEvent | RosterEvent;

export interface MatchState {
  currentSet: number;
  sidesSwapped: boolean;
  teams: TeamMap<Team>;
  log: MatchEvent[];
  startedAt?: string;
  groupId?: string;
  initialRoster?: TeamMap<RosterPlayer[]>;
  dayContext?: DayContext;
  court?: {
    initial: TeamMap<Team>;
    changes: { at: number; teams: TeamMap<Team> }[];
  };
}

export type MatchAction =
  | { type: 'point'; team: TeamId; playerId: string; startedAt?: string }
  | { type: 'closeSet' | 'undo' | 'reset' | 'switchSides' }
  | { type: 'edit'; teams: TeamMap<Team> }
  | { type: 'roster'; rosters: TeamMap<RosterPlayer[]> };

export interface PlayerTotals extends RosterPlayer {
  matchPoints: number;
  isError?: boolean;
}

export interface MatchPlayerStatistics extends PlayerTotals {
  teamId: TeamId;
  teamIds: TeamId[];
  teamPoints: Partial<TeamMap<number>>;
  teamName: string;
}

export interface RankedPlayer {
  id: string;
  name: string;
  points: number;
  teamId: TeamId;
  teamName: string;
}

export interface SetScore {
  scoreA?: number | string;
  scoreB?: number | string;
  score_a?: number | string;
  score_b?: number | string;
  early_finish?: boolean;
}

export interface MatchArchive {
  id: string;
  formatVersion: 1;
  closedAt: string;
  syncStatus: string;
  state: MatchState;
  dayContext?: DayContext;
  unavailable?: false;
}

export interface UnavailableMatch {
  id: string;
  syncStatus?: string;
  unavailable: true;
  closedAt?: undefined;
}

export type StoredMatch = MatchArchive | UnavailableMatch;

export interface CloseMatchOptions {
  id?: string;
  closedAt?: string;
  dayContext?: DayContext | null;
}

export type MatchSnapshot = Omit<MatchArchive, 'syncStatus' | 'unavailable'>;
