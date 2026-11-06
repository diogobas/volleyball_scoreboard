import { loadEnv } from 'vite';
import { readSupabaseConfig } from '../src/remote/config.js';

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
const groups = await request('groups?select=id,name,time_zone&limit=100');
if (!groups.response.ok || !Array.isArray(groups.data)) throw new Error(groups.data.message || 'Public groups could not be read.');
for (const group of groups.data) {
  const summary = await request('rpc/public_group_summary', { p_group_id: group.id, p_season: null, p_page: 1 });
  if (!summary.response.ok) throw new Error(summary.data.message || 'Apply the public statistics migration.');
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
