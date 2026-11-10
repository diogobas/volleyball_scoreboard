import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { IDBFactory } from 'fake-indexeddb';
import { createMatch, enableCourtMode, matchReducer, restoreMatch } from './match.js';
import {
  applyDayLineup,
  startIndependentMatch,
  bindSavedMatch,
  receivedMatchPayload,
} from './gameDay.js';
import {
  CLOSED_STORE,
  closeStoredMatch,
  listStoredMatches,
  loadStoredMatch,
  openMatchDatabase,
  saveStoredMatch,
} from './storage.js';
import { matchPayload } from '../remote/matchPayload.js';
import { closeDayDatabaseWhenUploadsFinish, uploadReceivedMatch } from '../remote/gameDays.js';
import { recordedParticipants, reconcileSubmission } from '../public/reconciliation.js';

const players = Array.from({ length: 13 }, (_, i) => ({
  id: randomUUID(),
  name: `Player ${i + 1}`,
}));
const context = {
  day_id: randomUUID(),
  group_id: randomUUID(),
  group_name: 'Court',
  play_date: '2026-11-07',
  lineup_version: 1,
  code: 'test-code',
  lineup: {
    A: { name: 'Home', players: players.slice(0, 6) },
    B: { name: 'Away', players: players.slice(6, 12) },
  },
};
const point = (state, team = 'A', playerId = 'p1') =>
  matchReducer(state, { type: 'point', team, playerId });
const close = (state) => matchReducer(state, { type: 'closeSet' });
const archive = (state) => ({
  id: randomUUID(),
  formatVersion: 1,
  closedAt: '2026-11-08T01:00:00.000Z',
  state,
});
async function database(t) {
  const db = await openMatchDatabase(new IDBFactory());
  t.after(() => db.close());
  await loadStoredMatch(db, () => null);
  return db;
}
async function saveArchive(db, item) {
  await saveStoredMatch(db, item.state);
  await closeStoredMatch(db, item.state, { id: item.id, closedAt: item.closedAt });
}

test('loaded lineups persist offline; new games retain names and day, with an independent edit history', async (t) => {
  const db = await database(t);
  let state = applyDayLineup(enableCourtMode(createMatch()), context);
  const teams = structuredClone(state.teams);
  teams.A.players[0].name = 'New name';
  state = matchReducer(point(state), { type: 'edit', teams });
  state = close(point(state));
  const item = archive(state);
  await saveArchive(db, item);
  const active = await loadStoredMatch(db);
  assert.equal(active.dayContext.day_id, context.day_id);
  assert.equal(active.teams.A.players[0].name, 'New name');
  assert.equal(active.log.length, 0);
  assert.equal(active.court.changes.length, 0);
  const saved = (await listStoredMatches(db))[0];
  assert.equal(saved.state.log[0].playerName, 'Player 1');
  assert.equal(saved.state.log[1].playerName, 'New name');
  const payload = receivedMatchPayload(saved);
  assert.equal(payload.sets[0].segments.length, 2);
  assert.equal(payload.sets[0].segments[1].rosters.A[0].hint_id, null);
  assert.equal(JSON.stringify(payload).includes('test-code'), false);
  assert.throws(() => applyDayLineup(point(active), context), /Save or reset/);
});

test('binding an offline free-name match preserves history; code updates never change retry content', async (t) => {
  const db = await database(t);
  const item = archive(close(point(enableCourtMode(createMatch()))));
  await saveArchive(db, item);
  await bindSavedMatch(db, item.id, context);
  const saved = (await listStoredMatches(db))[0];
  assert.deepEqual(saved.state, item.state);
  const before = receivedMatchPayload(saved);
  assert.equal(before.lineup_version, null);
  await bindSavedMatch(db, item.id, { ...context, code: 'new-code', lineup_version: 2 });
  assert.deepEqual(receivedMatchPayload((await listStoredMatches(db))[0]), before);
  await assert.rejects(
    bindSavedMatch(db, item.id, { ...context, day_id: randomUUID() }),
    /another day/,
  );
});

test('lost remote response keeps the archive, and retry removes it only after an exact durable receipt', async (t) => {
  const db = await database(t);
  const item = archive(close(point(applyDayLineup(enableCourtMode(createMatch()), context))));
  await saveArchive(db, item);
  let stored;
  let first = true;
  const client = {
    rpc(name, args) {
      assert.equal(name, 'receive_day_match');
      stored ??= args.p_match;
      assert.deepEqual(stored, args.p_match);
      if (first) {
        first = false;
        return Promise.resolve({ error: new Error('Response lost') });
      }
      return Promise.resolve({
        data: {
          status: 'already_received',
          published: true,
          match_id: item.id,
          day_id: context.day_id,
          submission: stored,
        },
      });
    },
  };
  await assert.rejects(uploadReceivedMatch(db, item.id, client), /Response lost/);
  assert.equal((await listStoredMatches(db)).length, 1);
  await bindSavedMatch(db, item.id, { ...context, code: 'new-code', lineup_version: 2 });
  await uploadReceivedMatch(db, item.id, client);
  assert.equal((await listStoredMatches(db)).length, 0);
  assert.equal((await loadStoredMatch(db)).log.length, 0);
});

test('mismatched receipts and interrupted or concurrent uploads keep original local data', async (t) => {
  const db = await database(t);
  const item = archive(close(point(applyDayLineup(enableCourtMode(createMatch()), context))));
  await saveArchive(db, item);
  await assert.rejects(
    uploadReceivedMatch(db, item.id, {
      rpc: () =>
        Promise.resolve({
          data: {
            status: 'received',
            published: true,
            match_id: item.id,
            day_id: context.day_id,
            submission: {},
          },
        }),
    }),
    /did not match/,
  );
  assert.equal((await listStoredMatches(db)).length, 1);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const client = {
    rpc: (_name, args) => {
      started();
      return held.then(() => ({
        data: {
          status: 'received',
          published: true,
          match_id: item.id,
          day_id: context.day_id,
          submission: args.p_match,
        },
      }));
    },
  };
  const first = uploadReceivedMatch(db, item.id, client);
  await ready;
  await assert.rejects(uploadReceivedMatch(db, item.id, client), /already uploading/);
  await assert.rejects(bindSavedMatch(db, item.id, context), /Wait for the upload/);
  release();
  await first;
  assert.equal((await listStoredMatches(db)).length, 0);
});

test('unregistered names require explicit mappings, with participant identity preserved per segment', () => {
  let state = applyDayLineup(enableCourtMode(createMatch()), context);
  state = point(state);
  const teams = structuredClone(state.teams);
  teams.A.players[0].name = 'Substitute';
  state = matchReducer(state, { type: 'edit', teams });
  state = close(point(state));
  const raw = receivedMatchPayload(archive(restoreMatch(JSON.stringify(state))));
  const people = recordedParticipants(raw);
  assert.equal(people.length, 13);
  assert.throws(() => reconcileSubmission(raw, {}, players), /Associate every/);
  const mapping = Object.fromEntries(
    people.map((p) => [
      p.key,
      p.name === 'Substitute' ? players[12].id : players.find((k) => k.name === p.name).id,
    ]),
  );
  const result = reconcileSubmission(raw, mapping, players);
  assert.equal(result.sets[0].rosters.A.length, 7);
  assert.equal(result.sets[0].points[0].player_id, players[0].id);
  assert.equal(result.sets[0].points[1].player_id, players[12].id);
  mapping[people.find((p) => p.name === 'Substitute').key] = players[1].id;
  assert.throws(() => reconcileSubmission(raw, mapping, players), /twelve different/);
});

test('empty name edits use existing names and Undo preserves name changes for subsequent points', () => {
  let state = applyDayLineup(enableCourtMode(createMatch()), context);
  const blank = structuredClone(state.teams);
  blank.A.name = '  ';
  blank.A.players[0].name = '  ';
  state = matchReducer(state, { type: 'edit', teams: blank });
  assert.deepEqual(restoreMatch(JSON.stringify(state)), state);
  state = point(point(point(state)));
  const draft = structuredClone(state.teams);
  draft.A.players[1].name = 'Substitute';
  state = matchReducer(state, { type: 'edit', teams: draft });
  state = matchReducer(matchReducer(state, { type: 'undo' }), { type: 'undo' });
  state = close(point(state, 'B'));
  const payload = receivedMatchPayload(archive(restoreMatch(JSON.stringify(state))));
  assert.equal(payload.sets[0].segments[0].rosters.A[1].name, players[1].name);
  assert.equal(payload.sets[0].segments[1].rosters.A[1].name, 'Substitute');
});

test('leaving the app waits for in-flight receipt confirmation before closing IndexedDB', async (t) => {
  const db = await database(t);
  const item = archive(close(point(applyDayLineup(enableCourtMode(createMatch()), context))));
  await saveArchive(db, item);
  let finish, started;
  const held = new Promise((resolve) => {
    finish = resolve;
  });
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const pending = uploadReceivedMatch(db, item.id, {
    rpc: (_name, args) => {
      started();
      return held.then(() => ({
        data: {
          status: 'received',
          published: true,
          match_id: item.id,
          day_id: context.day_id,
          submission: args.p_match,
        },
      }));
    },
  });
  await ready;
  const shutdown = closeDayDatabaseWhenUploadsFinish(db);
  assert.equal((await listStoredMatches(db)).length, 1);
  finish();
  await pending;
  await shutdown;
  assert.throws(() => db.transaction(CLOSED_STORE), { name: 'InvalidStateError' });
});

test('Save & sync can bind only the archived free-name match without replacing its lineup', async (t) => {
  const db = await database(t);
  const state = close(point(enableCourtMode(createMatch())));
  await saveStoredMatch(db, state);
  const id = randomUUID();
  const next = await closeStoredMatch(db, state, { id, dayContext: context });
  assert.equal(next.dayContext, undefined);
  const saved = (await listStoredMatches(db))[0];
  assert.equal(saved.dayContext.day_id, context.day_id);
  assert.deepEqual(saved.state, state);
  const payload = receivedMatchPayload(saved);
  assert.equal(payload.lineup_version, null);
  assert.equal(payload.sets[0].segments[0].rosters.A[0].hint_id, null);
});

test('legacy registered matches still allow free edits and preserve point authors through restart', () => {
  let state = createMatch();
  state.groupId = context.group_id;
  for (const team of ['A', 'B'])
    state.teams[team].players.forEach((p, i) => {
      if (!p.isError) {
        p.personId = context.lineup[team].players[i].id;
        p.name = context.lineup[team].players[i].name;
      }
    });
  state = enableCourtMode(point(state));
  const teams = structuredClone(state.teams);
  teams.A.players[0].name = 'Changed freely';
  state = matchReducer(state, { type: 'edit', teams });
  state = close(point(state));
  const restored = restoreMatch(JSON.stringify(state));
  assert.equal(restored.teams.A.players[0].name, 'Changed freely');
  assert.equal(restored.log[0].playerName, players[0].name);
  assert.equal(restored.log[1].playerName, 'Changed freely');
  assert.equal(restored.log[0].personId, players[0].id);
});

test('old registered archives retain the original version-one upload contract after binding a code', () => {
  let state = createMatch();
  state.groupId = context.group_id;
  for (const team of ['A', 'B'])
    state.teams[team].players.forEach((p, i) => {
      if (!p.isError) {
        p.personId = context.lineup[team].players[i].id;
        p.name = context.lineup[team].players[i].name;
      }
    });
  state = close(point(state));
  const saved = { ...archive(state), dayContext: context };
  assert.deepEqual(receivedMatchPayload(saved), matchPayload(saved));
  assert.equal(receivedMatchPayload(saved).format_version, 1);
});

test('choosing an independent match removes the day link offline while keeping editable names and sides', async (t) => {
  const db = await database(t);
  const loaded = applyDayLineup(enableCourtMode(createMatch()), context);
  loaded.sidesSwapped = true;
  const independent = startIndependentMatch(loaded);
  assert.equal(independent.dayContext, undefined);
  assert.equal(independent.groupId, undefined);
  assert.equal(independent.sidesSwapped, true);
  assert.equal(independent.teams.A.name, 'Home');
  assert.equal(independent.teams.A.players[0].name, players[0].name);
  await saveStoredMatch(db, independent);
  assert.deepEqual(await loadStoredMatch(db), independent);
  assert.throws(() => startIndependentMatch(point(loaded)), /Save or reset/);
  assert.equal(loaded.dayContext.day_id, context.day_id);
});

test('an old server receipt without completed status keeps the local match for retry', async (t) => {
  const db = await database(t);
  const item = archive(close(point(applyDayLineup(enableCourtMode(createMatch()), context))));
  await saveArchive(db, item);
  const client = {
    rpc: (_name, args) =>
      Promise.resolve({
        data: {
          status: 'received',
          match_id: item.id,
          day_id: context.day_id,
          submission: args.p_match,
        },
      }),
  };
  await assert.rejects(
    uploadReceivedMatch(db, item.id, client),
    /not confirmed this match as completed/,
  );
  assert.equal((await listStoredMatches(db)).length, 1);
});

test('a retry of a match deleted by the admin clears only the local queue without republishing', async (t) => {
  const db = await database(t);
  const item = archive(close(point(applyDayLineup(enableCourtMode(createMatch()), context))));
  await saveArchive(db, item);
  const client = {
    rpc: (_name, args) =>
      Promise.resolve({
        data: {
          status: 'already_received',
          published: false,
          deleted: true,
          match_id: item.id,
          day_id: context.day_id,
          submission: args.p_match,
        },
      }),
  };
  const receipt = await uploadReceivedMatch(db, item.id, client);
  assert.equal(receipt.deleted, true);
  assert.equal((await listStoredMatches(db)).length, 0);
});
