export interface LocalGroup {
  id: string;
  name: string;
  timeZone: string;
  localOnly?: boolean;
  linkedTo?: string;
  adminUserIds?: string[];
  lastSyncedAt?: string;
}

export interface LocalPlayer {
  id: string;
  groupId: string;
  name: string;
  normalizedName: string;
  category?: string;
  syncStatus: string;
  canonicalId?: string;
  remotePlayer?: LocalPlayer;
  conflictType?: string;
}

export interface RegistryCache {
  groups: LocalGroup[];
  players: LocalPlayer[];
  userId: string | null;
  selectedGroupId?: string;
}

export interface SeasonRow {
  personId: string;
  name: string;
  points: number;
  matches: number;
  wins: number;
  dates: Set<string>;
}
