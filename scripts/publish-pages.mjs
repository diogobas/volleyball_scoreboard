// Direct Upload API: cf currently exposes deployments but not the asset uploader.
// https://developers.cloudflare.com/api/resources/pages/subresources/assets/
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import path from 'node:path';

const project = 'volleyball-scoreboard-results';
const account = process.env.CLOUDFLARE_ACCOUNT_ID || '5f380893b69ce820eb3ef47ef9735a65';
const root = path.resolve('dist-public');
const types = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff':'font/woff', '.woff2':'font/woff2', '.png':'image/png', '.json':'application/json' };
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile()) {
      const content = await readFile(full);
      const contentType = types[path.extname(entry.name)] || 'application/octet-stream';
      const key = createHash('sha256').update(contentType).update('\0').update(content).digest('hex').slice(0,32);
      files.push({ name: '/' + path.relative(root,full).split(path.sep).join('/'), key, value: content.toString('base64'), base64: true, metadata: { contentType } });
    }
  }
}
await readFile(path.join(root,'index.html'));
await walk(root);
if (!process.argv.includes('--upload')) {
  console.log(`Dry run: ${files.length} static files from dist-public to ${project}.pages.dev; no API requests.`);
  process.exit(0);
}
let token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  // Reuse the cf session only in memory. Never write or print credentials.
  const configFile = process.env.CF_AUTH_CONFIG || path.join(homedir(),'Library/Preferences/cloudflare/config/default.json');
  const config = JSON.parse(await readFile(configFile,'utf8'));
  if (Date.parse(config.expiration_time) <= Date.now()) throw new Error('Cloudflare session expired; run cf auth login.');
  token = config.oauth_token;
}
if (!token) throw new Error('Authenticate with cf or provide CLOUDFLARE_API_TOKEN locally.');
async function api(endpoint, { method='GET', body, bearer=token } = {}) {
  const form = body instanceof FormData;
  const response = await fetch(`https://api.cloudflare.com/client/v4${endpoint}`, {
    method, headers: { Authorization: `Bearer ${bearer}`, ...(!form && body ? { 'Content-Type':'application/json' } : {}) },
    ...(body ? {body: form ? body : JSON.stringify(body)} : {}), signal: AbortSignal.timeout(90_000),
  });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`Cloudflare ${response.status}: ${(data.errors || []).map(error => error.message).join('; ')}`);
  return data.result;
}
const base = `/accounts/${account}/pages/projects/${project}`;
const info = await api(base);
if (info.production_branch !== 'public' || info.source) throw new Error('Expected the dedicated Direct Upload project and public production branch.');
const { jwt } = await api(`${base}/upload-token`);
const hashes = [...new Set(files.map(file=>file.key))];
const missing = new Set(await api('/pages/assets/check-missing', {method:'POST',body:{hashes},bearer:jwt}));
const pending = [...new Map(files.filter(file=>missing.has(file.key)).map(({name,...file})=>[file.key,file])).values()];
for (let index=0; index<pending.length; index+=10) {
  await api('/pages/assets/upload',{method:'POST',body:pending.slice(index,index+10),bearer:jwt});
}
await api('/pages/assets/upsert-hashes',{method:'POST',body:{hashes},bearer:jwt});
const form = new FormData();
form.set('branch','public');
form.set('manifest', JSON.stringify(Object.fromEntries(files.map(file=>[file.name,file.key]))));
form.set('_headers',new Blob([await readFile(path.join(root,'_headers'))],{type:'text/plain'}),'_headers');
const deployment = await api(`${base}/deployments`,{method:'POST',body:form});
console.log(`Deployment created: ${deployment.id}`);
console.log(`Public URL: https://${info.subdomain}`);
console.log(`Deployment URL: ${deployment.url}`);
