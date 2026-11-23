import { loadEnv } from 'vite';
import { readSupabaseConfig } from '../src/remote/config';

const config = readSupabaseConfig(loadEnv('production', process.cwd(), 'VITE_SUPABASE_'));
if (!config.configured) throw new Error('Configure the Supabase public URL/key before checking the release.');
async function request(path, body) {
  const response = await fetch(`${config.url}/rest/v1/${path}`, { method: body ? 'POST' : 'GET',
    headers: { apikey: config.key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json();
  return { response, data };
}
const communityRef = process.env.COMMUNITY_REF ?? 'C-1';
const community = await request('rpc/public_community', { p_community_ref: communityRef });
if (!community.response.ok || !Array.isArray(community.data.groups)) throw new Error(community.data.message || 'Apply the community migration.');
for (const table of ['groups', 'communities', 'players', 'matches']) {
  const global = await request(`${table}?select=*&limit=1`);
  if (global.response.ok) throw new Error(`Global anonymous ${table} reads must be denied.`);
}
const groups = { data: community.data.groups };
for (const group of groups.data) {
  const summary = await request('rpc/public_group_period_summary', { p_group_id: group.id, p_season: null, p_page: 1, p_period: 'all' });
  if (!summary.response.ok) throw new Error(summary.data.message || 'Apply the public statistics migration.');
  const player = summary.data.players[0];
  if (player) {
    const profile = await request('rpc/public_player_profile', { p_group_id: group.id, p_player_ref: player.id, p_season: summary.data.season, p_period: 'all', p_page: 1, p_page_size: 5 });
    if (!profile.response.ok || profile.data.player?.id !== player.id || profile.data.statistics?.points !== player.points) throw new Error('Public player profile failed or its statistics disagree with group totals.');
  }
  const first = summary.data.matches[0];
  if (first) {
    const details = await request('rpc/public_match_details', { p_group_id: group.id, p_match_id: first.id });
    if (!details.response.ok || details.data.id !== first.id) throw new Error('Public match details failed.');
    const denied = await request('rpc/get_match_for_edit', { p_group_id: group.id, p_match_id: first.id });
    if (denied.response.ok || denied.data.code !== '42501') throw new Error('Check the administration migration and its anonymous-access restrictions.');
  }
  console.log(`${group.name}: public season ${summary.data.season}, ${summary.data.match_count} confirmed matches; public details and admin access checks passed.`);
}
console.log('Read-only backend check complete. No matches, accounts or permissions were changed.');
