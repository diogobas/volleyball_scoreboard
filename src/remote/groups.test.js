import test from 'node:test';
import assert from 'node:assert/strict';
import { remoteGroups } from './groups.js';

test('group operations use the authorized RPC contract and never accept an actor supplied by the client', async () => {
  const calls = [];
  const group = { id: 'group', name: 'Group', time_zone: 'UTC' };
  const client = { rpc: async (name, args) => {
    calls.push({ name, args });
    return { data: name === 'create_group' || name === 'list_my_groups' ? [group] : [], error: null };
  } };
  const api = remoteGroups(client);
  assert.deepEqual(await api.list(), [group]);
  assert.deepEqual(await api.create(' Group ', ' UTC '), group);
  await api.administrators('group');
  await api.authorize('group', ' PERSON@EXAMPLE.TEST ');
  await api.revoke('group', 'target-user');
  assert.deepEqual(calls, [
    { name: 'list_my_groups', args: undefined },
    { name: 'create_group', args: { p_name: 'Group', p_time_zone: 'UTC' } },
    { name: 'list_group_admins', args: { p_group_id: 'group' } },
    { name: 'grant_group_admin', args: { p_group_id: 'group', p_email: 'person@example.test' } },
    { name: 'revoke_group_admin', args: { p_group_id: 'group', p_user_id: 'target-user' } },
  ]);
});

test('permission/network failures propagate and unconfirmed group creation is not reported as success', async () => {
  const failure = new Error('Not authorized');
  await assert.rejects(remoteGroups({ rpc: async () => ({ data: null, error: failure }) }).list(), /Not authorized/);
  await assert.rejects(remoteGroups({ rpc: async () => { throw new Error('Offline'); } }).list(), /Offline/);
  await assert.rejects(remoteGroups({ rpc: async () => ({ data: [], error: null }) }).create('Group', 'UTC'), /could not be confirmed/);
});

test('new community groups require a matching scoped confirmation', async () => {
  const communityId = 'community-id';
  const calls = [];
  const client = { rpc: async (name, args) => {
    calls.push({ name, args }); return { data: { id: 'new-group', name: 'New group', community_id: args.p_community_id } };
  } };
  assert.equal((await remoteGroups(client).createInCommunity(' New group ', communityId)).community_id, communityId);
  assert.equal(calls[0].name, 'create_community_group'); assert.equal(calls[0].args.p_name, 'New group');
  assert.equal(calls[0].args.p_community_id, communityId);
  const wrong = remoteGroups({ rpc: async () => ({ data: { id: 'wrong', community_id: 'another-community' } }) });
  await assert.rejects(wrong.createInCommunity('Group', communityId), /could not be confirmed/);
});
