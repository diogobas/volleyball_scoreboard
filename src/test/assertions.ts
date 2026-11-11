import assert from 'node:assert/strict';
import type {
  MatchArchive,
  MatchEvent,
  PointEvent,
  RosterEvent,
  RosterPlayer,
  SetEvent,
  StoredMatch,
  TeamMap,
} from '../game/types';
import type { AppRoute, GroupRoute } from '../public/routeTypes';
import type {
  MatchSubmission,
  RecordedSet,
  RecordedSubmission,
  SubmittedSet,
} from '../remote/models';

export const required = <T>(value: T | null | undefined): T => {
  assert.ok(value !== null && value !== undefined, 'Expected this fixture value to exist');
  return value;
};
export const readableArchive = (record: StoredMatch): MatchArchive => {
  assert.ok(!record.unavailable, 'Expected a readable saved match');
  return record;
};
export const pointEvent = (event: MatchEvent): PointEvent => {
  assert.equal(event.type, 'point');
  return event as PointEvent;
};
export const setEvent = (event: MatchEvent): SetEvent => {
  assert.equal(event.type, 'set');
  return event as SetEvent;
};
export const rosterEvent = (event: MatchEvent): RosterEvent => {
  assert.equal(event.type, 'roster');
  return event as RosterEvent;
};
export const playerRoute = (route: AppRoute): Extract<GroupRoute, { kind: 'player' }> => {
  assert.equal(route.kind, 'player');
  return route as Extract<GroupRoute, { kind: 'player' }>;
};
export const eventWithRosters = (
  event: MatchEvent,
): MatchEvent & { rosters: TeamMap<RosterPlayer[]> } => {
  assert.ok('rosters' in event && event.rosters);
  return event as MatchEvent & { rosters: TeamMap<RosterPlayer[]> };
};
export const groupRoute = (route: AppRoute): GroupRoute => {
  assert.ok('groupId' in route);
  return route;
};
export const recordedSet = (set: RecordedSet | SubmittedSet): RecordedSet => {
  assert.ok('segments' in set);
  return set;
};
export const submittedSet = (set: RecordedSet | SubmittedSet): SubmittedSet => {
  assert.ok('rosters' in set);
  return set;
};
export const recordedSubmission = (
  submission: RecordedSubmission | MatchSubmission,
): RecordedSubmission => {
  assert.equal(submission.format_version, 2);
  return submission as RecordedSubmission;
};
