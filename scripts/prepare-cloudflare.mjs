import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'dist-public');
await readFile(path.join(source, 'index.html')); // Fail before replacing output if the build is missing.
const name = process.env.PUBLIC_SITE_WORKER_NAME ?? 'volleyball-scoreboard-results';
if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new Error('Use a lowercase Worker name with letters, digits and hyphens.');
// Cloudflare Build Output v0, validated with cf 1.0.0-beta.28. --prebuilt avoids
// adding a Worker runtime or changing the native app's Vite build configuration.
const output = path.join(root, '.cloudflare/output/v0');
await rm(output, { recursive: true, force: true });
const worker = path.join(output, 'workers/default');
await mkdir(worker, { recursive: true });
await cp(source, path.join(worker, 'assets'), { recursive: true });
await writeFile(path.join(output, 'config.json'), JSON.stringify({ buildContext: { isPreview: false, mode: 'public' } }, null, 2));
await writeFile(path.join(worker, 'worker.config.json'), JSON.stringify({
  name, compatibilityDate: '2026-11-06', env: {}, workersDev: true,
  assets: { notFoundHandling: 'single-page-application' },
}, null, 2));
console.log(`Prepared static deployment for ${name}; only dist-public was copied.`);
